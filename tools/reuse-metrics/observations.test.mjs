import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { measureGame } from './report.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-observations-'));
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }));
const command = path.join(import.meta.dirname, 'observations.mjs');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let sequence = 0;
function fixture({ empty = false, offset = 0 } = {}) {
  const id = String(++sequence), dir = path.join(temporary, id);
  fs.mkdirSync(dir);
  const identity = { projectId: 'synthetic-project', observationId: 'synthetic-observation-' + id };
  const start = new Date(Date.UTC(2026, 0, 1 + offset, 10)).toISOString();
  const end = new Date(Date.UTC(2026, 0, 1 + offset, 11)).toISOString();
  const time = minutes => new Date(Date.parse(start) + minutes * 60_000).toISOString();
  const write = (name, data) => { const bytes = JSON.stringify(data); fs.writeFileSync(path.join(dir, name), bytes); return { file: name, sha256: digest(bytes) }; };
  const protocol = { version: 1, id: 'synthetic-task-v1', identity, preparedAt: time(-10), start, workerId: 'worker-one',
    scope: 'Add a supported record and setup variation.', playable: 'Execute a human action and automatic response.',
    quality: 'Independently check rules, refusals, saves and simulation.', countingMethod: 'normalized-records-v1' };
  const protocolRef = write('protocol.json', protocol);
  const common = { version: 1, identity, sourceRevision: 'a'.repeat(40), kitRevision: 'b'.repeat(40), protocolSha256: protocolRef.sha256, window: { start, end } };
  const usage = { ...common, recordId: 'usage-' + id, kind: 'usage', at: time(1), inputIncludesCached: true,
    values: { inputTokens: 120, cachedInputTokens: 30, outputTokens: 20, costUsd: 1.25 } };
  const development = { ...common, recordId: 'development-' + id, kind: 'development-log',
    ciAttempts: [{ runId: 'run-' + id, attempt: 1, conclusion: 'failure', at: time(2) }, { runId: 'run-' + id, attempt: 2, conclusion: 'success', at: time(3) }],
    interventions: [{ id: 'intervention-' + id, at: time(4) }] };
  const review = { ...common, recordId: 'review-' + id, kind: 'endpoint-review', at: end, reviewerId: 'reviewer-two',
    playable: { status: 'accepted', at: time(10) }, quality: 'accepted', ruleDefects: ['defect-' + id] };
  const manifest = { version: 1, identity, sourceRevision: common.sourceRevision, kitRevision: common.kitRevision,
    window: common.window, protocol: protocolRef, records: empty ? [] : [write('usage.json', usage), write('development.json', development), write('review.json', review)] };
  const file = path.join(dir, 'observation.json');
  const save = () => fs.writeFileSync(file, JSON.stringify(manifest));
  const replace = (name, data) => { const index = manifest.records.findIndex(record => record.file === name); manifest.records[index] = write(name, data); save(); };
  save();
  return { file, dir, manifest, common, protocol, usage, development, review, write, save, replace, time };
}
const run = (...args) => spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' });
const rejected = (result, message) => {
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(message);
};
const read = file => { const result = run(file); expect(result.status, result.stderr).toBe(0); return JSON.parse(result.stdout).observations[0]; };

describe('record-traced development observations', () => {
  it('derives quantities from actual digest-bound record bytes and exports compatible legacy telemetry', () => {
    const f = fixture();
    const result = read(f.file);
    expect(result.telemetry.inputTokens).toMatchObject({ kind: 'measured', value: 120, evidenceStatus: 'record-traced', trace: { method: 'sum-total-input-including-cache' } });
    expect(result.telemetry.cachedInputTokens.value).toBe(30);
    expect(result.telemetry.minutesToPlayable.value).toBe(10);
    expect(result.telemetry.failedCiRuns.value).toBe(1);
    expect(result.telemetry.ruleDefects.value).toBe(1);
    expect(result.supplemental.ciAttempts.value).toBe(2);
    expect(result.supplemental.interventions.value).toBe(1);
    for (const metric of Object.values(result.telemetry)) {
      expect(metric.trace.records.length).toBeGreaterThan(0);
      for (const source of metric.trace.records) expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    fs.mkdirSync(path.join(f.dir, 'kit'));
    fs.writeFileSync(path.join(f.dir, 'kit/kit.lock.json'), JSON.stringify({ commit: f.common.kitRevision, components: {} }));
    expect(measureGame(f.dir, result.legacyTelemetry).telemetry.inputTokens.value).toBe(120);
    expect(JSON.stringify(result)).not.toContain(f.dir);
    expect(result.outcome.status).toBe('accepted');
    expect(result.recordIntegrity).toBe('matched');
  });

  it('keeps absent raw usage, cost, endpoints and baseline unmeasured', () => {
    const f = fixture({ empty: true });
    const result = run(f.file), report = JSON.parse(result.stdout);
    expect(result.status).toBe(0);
    expect(report.observations[0].status).toBe('unmeasured');
    expect(report.observations[0].telemetry.inputTokens.kind).toBe('missing');
    expect(report.observations[0].telemetry.costUsd.kind).toBe('missing');
    expect(report.observations[0].outcome.status).toBe('not-assessed');
    expect(report.comparison).toMatchObject({ status: 'missing-baseline', differences: {} });
  });

  it('preserves estimates and inferences without promoting provenance labels to record traces', () => {
    const f = fixture({ empty: true });
    f.manifest.metrics = { costUsd: { kind: 'estimated', value: 2, provenance: 'synthetic-estimate' }, ruleDefects: { kind: 'inferred', value: 1, provenance: 'synthetic-inference' } };
    f.save();
    const result = read(f.file);
    expect(result.telemetry.costUsd).toMatchObject({ kind: 'estimated', value: 2, evidenceStatus: 'operator-reported' });
    expect(result.telemetry.ruleDefects.kind).toBe('inferred');
    f.manifest.metrics.inputTokens = { kind: 'measured', value: 100, provenance: 'unsupported-label' };
    f.save();
    rejected(run(f.file), 'measured values must come from source records');
  });

  it.each(['digest', 'revision', 'window', 'protocol', 'cached', 'unsafe'])('rejects %s mismatch before emitting measurements', kind => {
    const f = fixture();
    if (kind === 'digest') fs.appendFileSync(path.join(f.dir, 'usage.json'), ' ');
    if (kind === 'revision') f.usage.sourceRevision = 'c'.repeat(40);
    if (kind === 'window') f.usage.at = f.time(-1);
    if (kind === 'protocol') f.usage.protocolSha256 = '0'.repeat(64);
    if (kind === 'cached') f.usage.values.cachedInputTokens = 121;
    if (kind === 'unsafe') f.usage.values.inputTokens = Number.MAX_SAFE_INTEGER + 1;
    if (kind !== 'digest') f.replace('usage.json', f.usage);
    rejected(run(f.file), kind === 'digest' ? 'digest mismatch' : kind === 'cached' ? 'cached input exceeds total' : kind === 'unsafe' ? 'unsafe or invalid' : 'mismatch');
  });

  it('rejects repeated observations, source records, CI attempts and unsafe aggregates', () => {
    const f = fixture();
    rejected(run(f.file, f.file), 'duplicate observation');
    f.manifest.records.push(f.manifest.records[0]); f.save();
    rejected(run(f.file), 'duplicate source record');
    f.manifest.records.pop();
    f.development.ciAttempts.push(f.development.ciAttempts[0]); f.replace('development.json', f.development);
    rejected(run(f.file), 'duplicate CI attempt');
    f.development.ciAttempts.pop(); f.replace('development.json', f.development);
    f.usage.values.inputTokens = Number.MAX_SAFE_INTEGER; f.replace('usage.json', f.usage);
    f.manifest.records.push(f.write('second-usage.json', { ...f.usage, recordId: 'another-record', values: { inputTokens: 1 } })); f.save();
    rejected(run(f.file), 'unsafe or invalid');
  });

  it('requires a predeclared protocol and independent playable outcome', () => {
    const f = fixture();
    f.review.reviewerId = f.protocol.workerId; f.replace('review.json', f.review);
    rejected(run(f.file), 'independent reviewer');
    f.review.reviewerId = 'reviewer-two'; f.review.quality = 'rejected'; f.replace('review.json', f.review);
    const result = read(f.file);
    expect(result.outcome.status).toBe('rejected');
    expect(result.telemetry.minutesToPlayable.kind).toBe('missing');
    f.review.playable.status = 'rejected'; f.review.playable.at = f.time(-1); f.replace('review.json', f.review);
    rejected(run(f.file), 'source/task-window mismatch');
    f.review.playable.at = f.time(10); f.replace('review.json', f.review);
    f.protocol.preparedAt = f.time(1); f.manifest.protocol = f.write('protocol.json', f.protocol); f.save();
    rejected(run(f.file), 'before task start');
  });

  it('compares only independent accepted observations with the same scope and methods', () => {
    const current = fixture(), baseline = fixture({ offset: 1 });
    baseline.usage.values.inputTokens = 150; baseline.replace('usage.json', baseline.usage);
    const comparison = JSON.parse(run(current.file, '--baseline', baseline.file).stdout).comparison;
    expect(comparison).toMatchObject({ status: 'comparable', differences: { inputTokens: 30 }, causalSavings: 'not-established' });
    baseline.protocol.scope = 'A different task.';
    baseline.manifest.protocol = baseline.write('protocol.json', baseline.protocol);
    for (const [name, record] of [['usage.json', baseline.usage], ['development.json', baseline.development], ['review.json', baseline.review]]) {
      record.protocolSha256 = baseline.manifest.protocol.sha256; baseline.replace(name, record);
    }
    const incompatible = JSON.parse(run(current.file, '--baseline', baseline.file).stdout).comparison;
    expect(incompatible).toMatchObject({ status: 'incompatible-protocol', differences: {} });
  });

  it('leaves incomplete usage quantities missing and refuses aliased records', () => {
    const f = fixture();
    f.manifest.records.push(f.write('partial-usage.json', { ...f.usage, recordId: 'partial-usage', values: { inputTokens: 10 } })); f.save();
    const result = read(f.file);
    expect(result.telemetry.inputTokens.value).toBe(130);
    expect(result.telemetry.cachedInputTokens.kind).toBe('missing');
    expect(result.telemetry.costUsd.kind).toBe('missing');
    fs.linkSync(path.join(f.dir, 'usage.json'), path.join(f.dir, 'alias.json'));
    rejected(run(f.file), 'unaliased local file');
  });

  it('keeps a no-kit baseline distinct from the legacy locked-game projection', () => {
    const f = fixture();
    f.manifest.kitRevision = 'none';
    for (const [name, record] of [['usage.json', f.usage], ['development.json', f.development], ['review.json', f.review]]) {
      record.kitRevision = 'none'; f.replace(name, record);
    }
    expect(read(f.file).legacyTelemetry).toBe(null);
    const current = fixture({ offset: 1 });
    expect(JSON.parse(run(current.file, '--baseline', f.file).stdout).comparison.status).toBe('comparable');
    f.review.quality = 'not-assessed'; f.replace('review.json', f.review);
    expect(JSON.parse(run(current.file, '--baseline', f.file).stdout).comparison).toMatchObject({ status: 'unaccepted-outcome', differences: {} });
  });
});
