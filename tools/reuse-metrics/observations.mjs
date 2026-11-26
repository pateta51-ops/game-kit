import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const metricKeys = ['inputTokens', 'outputTokens', 'cachedInputTokens', 'costUsd', 'minutesToPlayable', 'failedCiRuns', 'ruleDefects'];
const usageKeys = ['inputTokens', 'outputTokens', 'cachedInputTokens', 'costUsd'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const object = (value, name) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(name + ' must be an object');
  return value;
};
const keys = (value, allowed, name) => {
  object(value, name);
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('unsupported ' + name + ' field');
};
const label = (value, name) => {
  if (typeof value !== 'string' || !/^[a-z\d][a-z\d._-]*$/i.test(value)) throw new Error('invalid ' + name + ' label');
  return value;
};
const identity = value => {
  keys(value, ['projectId', 'observationId'], 'identity');
  return { projectId: label(value.projectId, 'project'), observationId: label(value.observationId, 'observation') };
};
const revision = value => {
  if (typeof value !== 'string' || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value)) throw new Error('invalid source revision');
  return value.toLowerCase();
};
const kitRevision = value => value === 'none' ? 'none' : revision(value);
const utc = value => {
  const date = new Date(typeof value === 'string' ? value : NaN);
  if (!Number.isFinite(date.getTime()) || ![date.toISOString(), date.toISOString().replace('.000Z', 'Z')].includes(value)) throw new Error('invalid UTC timestamp');
  return date.toISOString();
};
const windowOf = value => {
  keys(value, ['start', 'end'], 'window');
  const start = utc(value.start), end = utc(value.end);
  if (start >= end) throw new Error('task window must end after it starts');
  return { start, end };
};
const valueOf = (key, value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!['costUsd', 'minutesToPlayable'].includes(key) && !Number.isSafeInteger(value))) throw new Error('unsafe or invalid ' + key);
  return value;
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const unique = (set, value, name) => {
  if (set.has(value)) throw new Error('duplicate ' + name);
  set.add(value);
};
const within = (window, value, inclusive = false) => {
  const at = utc(value);
  if (at < window.start || (inclusive ? at > window.end : at >= window.end)) throw new Error('source/task-window mismatch');
  return at;
};
function readSource(directory, reference) {
  keys(reference, ['file', 'sha256'], 'source reference');
  if (typeof reference.file !== 'string' || !reference.file || path.isAbsolute(reference.file) || reference.file.includes('\\')
    || reference.file.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-f0-9]{64}$/.test(reference.sha256 ?? '')) throw new Error('invalid local source reference');
  const target = path.join(directory, reference.file);
  let bytes;
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 10 * 1024 * 1024 || fs.realpathSync(target) !== target) throw new Error('aliased source');
    bytes = fs.readFileSync(target);
  } catch { throw new Error('source must be a readable unaliased local file'); }
  if (digest(bytes) !== reference.sha256) throw new Error('source record digest mismatch');
  try { return { data: JSON.parse(bytes.toString('utf8')), sha256: reference.sha256 }; }
  catch { throw new Error('malformed source record'); }
}
const missing = reason => ({ kind: 'missing', evidenceStatus: 'missing', reason });
const measured = (key, value, method, records) => ({ kind: 'measured', value: valueOf(key, value), provenance: 'record-trace', evidenceStatus: 'record-traced',
  trace: { method, records: records.map(record => ({ recordId: record.data.recordId, sha256: record.sha256 })) } });

/** Validate bounded local source records; a matching digest is not provider authentication. */
export function importObservation(file) {
  let input, directory;
  try { directory = fs.realpathSync(path.dirname(path.resolve(file))); input = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('unreadable observation manifest'); }
  keys(input, ['version', 'identity', 'sourceRevision', 'kitRevision', 'window', 'protocol', 'records', 'metrics'], 'observation');
  if (input.version !== 1 || !Array.isArray(input.records) || input.records.length > 10_000) throw new Error('unsupported observation version or record inventory');
  const observedIdentity = identity(input.identity), sourceRevision = revision(input.sourceRevision), pin = kitRevision(input.kitRevision), window = windowOf(input.window);
  const protocolSource = readSource(directory, input.protocol), protocol = protocolSource.data;
  keys(protocol, ['version', 'id', 'identity', 'preparedAt', 'start', 'workerId', 'scope', 'playable', 'quality', 'countingMethod'], 'protocol');
  if (protocol.version !== 1 || protocol.countingMethod !== 'normalized-records-v1') throw new Error('unsupported observation counting method');
  label(protocol.id, 'protocol'); label(protocol.workerId, 'worker');
  if (!same(identity(protocol.identity), observedIdentity) || utc(protocol.start) !== window.start) throw new Error('protocol/task mismatch');
  if (utc(protocol.preparedAt) > window.start) throw new Error('protocol must be declared before task start');
  for (const field of ['scope', 'playable', 'quality']) if (typeof protocol[field] !== 'string' || !protocol[field].trim()) throw new Error('protocol requires ' + field);
  const compatibility = digest(JSON.stringify([protocol.id, protocol.countingMethod, protocol.scope, protocol.playable, protocol.quality]));
  const recordIds = new Set(), recordHashes = new Set(), attempts = new Set(), interventions = new Set();
  const records = input.records.map(reference => {
    const record = readSource(directory, reference), data = record.data;
    object(data, 'source record');
    const extra = data.kind === 'usage' ? ['at', 'inputIncludesCached', 'values'] : data.kind === 'development-log' ? ['ciAttempts', 'interventions']
      : data.kind === 'endpoint-review' ? ['at', 'reviewerId', 'playable', 'quality', 'ruleDefects'] : [];
    if (!extra.length) throw new Error('unsupported normalized record kind');
    keys(data, ['version', 'recordId', 'kind', 'identity', 'sourceRevision', 'kitRevision', 'protocolSha256', 'window', ...extra], 'source record');
    if (data.version !== 1 || !same(identity(data.identity), observedIdentity) || revision(data.sourceRevision) !== sourceRevision || kitRevision(data.kitRevision) !== pin
      || data.protocolSha256 !== protocolSource.sha256 || !same(windowOf(data.window), window)) throw new Error('source/protocol/task mismatch');
    unique(recordIds, label(data.recordId, 'source record'), 'source record');
    unique(recordHashes, record.sha256, 'source record');
    if (data.kind === 'usage') {
      within(window, data.at);
      keys(data.values, usageKeys, 'usage values');
      for (const [key, value] of Object.entries(data.values)) valueOf(key, value);
      if (data.values.inputTokens !== undefined && data.inputIncludesCached !== true) throw new Error('input tokens must explicitly include cached input');
      if (data.values.cachedInputTokens !== undefined && (data.values.inputTokens === undefined || data.values.cachedInputTokens > data.values.inputTokens)) throw new Error('cached input exceeds total input or total input is missing');
    } else if (data.kind === 'development-log') {
      if (!Array.isArray(data.ciAttempts) || !Array.isArray(data.interventions)) throw new Error('invalid development log');
      for (const attempt of data.ciAttempts) {
        keys(attempt, ['runId', 'attempt', 'conclusion', 'at'], 'CI attempt');
        label(attempt.runId, 'CI run'); valueOf('attempt', attempt.attempt);
        if (attempt.attempt < 1 || !['success', 'failure', 'cancelled', 'skipped'].includes(attempt.conclusion)) throw new Error('invalid CI attempt');
        within(window, attempt.at);
        unique(attempts, JSON.stringify([attempt.runId, attempt.attempt]), 'CI attempt');
      }
      for (const intervention of data.interventions) {
        keys(intervention, ['id', 'at'], 'intervention');
        within(window, intervention.at);
        unique(interventions, label(intervention.id, 'intervention'), 'intervention');
      }
    } else {
      within(window, data.at, true);
      if (label(data.reviewerId, 'reviewer') === protocol.workerId) throw new Error('endpoint requires an independent reviewer');
      keys(data.playable, ['status', 'at'], 'playable endpoint');
      if (![data.playable.status, data.quality].every(status => ['accepted', 'rejected', 'not-assessed'].includes(status)) || !Array.isArray(data.ruleDefects)) throw new Error('invalid endpoint review');
      const playableAt = data.playable.at === undefined ? undefined : within(window, data.playable.at, true);
      if (data.playable.status === 'accepted' && playableAt === undefined) throw new Error('accepted playable endpoint requires a timestamp');
      if (playableAt && playableAt > utc(data.at)) throw new Error('playable endpoint follows its review');
      const defects = new Set();
      for (const defect of data.ruleDefects) unique(defects, label(defect, 'rule defect'), 'rule defect');
    }
    return record;
  });
  const usage = records.filter(record => record.data.kind === 'usage');
  const development = records.filter(record => record.data.kind === 'development-log');
  const reviews = records.filter(record => record.data.kind === 'endpoint-review');
  if (reviews.length > 1) throw new Error('ambiguous endpoint reviews: supply one final independent review');
  const review = reviews[0]?.data;
  const accepted = review?.playable.status === 'accepted' && review.quality === 'accepted';
  const outcome = { status: accepted ? 'accepted' : review && [review.playable.status, review.quality].includes('rejected') ? 'rejected' : 'not-assessed',
    ...(review ? { review: { recordId: review.recordId, sha256: reviews[0].sha256, reviewerId: review.reviewerId } } : {}) };
  const telemetry = Object.fromEntries(metricKeys.map(key => [key, missing('No complete supporting source records')]));
  for (const key of usageKeys) if (usage.length && usage.every(record => record.data.values[key] !== undefined)) {
    let total = 0;
    for (const record of usage) total = valueOf(key, total + record.data.values[key]);
    telemetry[key] = measured(key, total, key === 'inputTokens' ? 'sum-total-input-including-cache' : 'sum-' + key, usage);
  }
  if (accepted) telemetry.minutesToPlayable = measured('minutesToPlayable', (Date.parse(review.playable.at) - Date.parse(window.start)) / 60_000, 'elapsed-wall-minutes-to-reviewed-playable', reviews);
  if (development.length) telemetry.failedCiRuns = measured('failedCiRuns', development.flatMap(record => record.data.ciAttempts).filter(attempt => attempt.conclusion === 'failure').length, 'count-failed-unique-run-attempts', development);
  if (review) telemetry.ruleDefects = measured('ruleDefects', review.ruleDefects.length, 'count-unique-rule-findings', reviews);
  if (input.metrics !== undefined) {
    keys(input.metrics, metricKeys, 'manual metrics');
    for (const [key, metric] of Object.entries(input.metrics)) {
      keys(metric, ['kind', 'value', 'provenance'], 'manual metric');
      if (metric.kind === 'measured') throw new Error('measured values must come from source records');
      if (!['estimated', 'inferred'].includes(metric.kind)) throw new Error('invalid manual metric kind');
      if (telemetry[key].kind === 'measured') throw new Error('manual metric conflicts with a record-derived measurement');
      telemetry[key] = { kind: metric.kind, value: valueOf(key, metric.value), provenance: label(metric.provenance, 'metric provenance'), evidenceStatus: 'operator-reported' };
    }
  }
  if (telemetry.cachedInputTokens.value !== undefined && (telemetry.inputTokens.value === undefined || telemetry.cachedInputTokens.value > telemetry.inputTokens.value)) throw new Error('cached input exceeds total input or total input is missing');
  const metrics = Object.fromEntries(Object.entries(telemetry).filter(([, metric]) => metric.kind !== 'missing').map(([key, metric]) => [key, { kind: metric.kind, value: metric.value, provenance: metric.provenance }]));
  return {
    version: 1, identity: observedIdentity, sourceRevision, kitRevision: pin, window,
    status: Object.values(telemetry).some(metric => metric.kind === 'measured') ? 'record-traced' : Object.keys(metrics).length ? 'limited' : 'unmeasured',
    recordIntegrity: 'matched', sourceBinding: 'declared-in-records',
    protocol: { id: protocol.id, sha256: protocolSource.sha256, compatibility, preparedAt: utc(protocol.preparedAt) },
    sources: records.map(record => ({ recordId: record.data.recordId, kind: record.data.kind, sha256: record.sha256 })),
    outcome, telemetry,
    supplemental: { ciAttempts: development.length ? measured('ciAttempts', attempts.size, 'count-unique-run-attempts', development) : missing('No development log'),
      interventions: development.length ? measured('interventions', interventions.size, 'count-unique-interventions', development) : missing('No development log') },
    legacyTelemetry: pin === 'none' ? null : { identity: observedIdentity, sourceRevision, kitRevision: pin, window: { ...window, protocol: protocol.id }, metrics },
    limitations: ['Record digests establish the supplied bytes, not provider authenticity or collection completeness.', 'Source revisions and task associations are declared by the normalized records.',
      'Protocol preparation times and distinct reviewer identities are declarations, not independently authenticated events.', 'The endpoint review is a recorded independent assessment, not re-execution of its acceptance commands.',
      'Wall time is not active effort; one observation cannot establish causal savings.', 'The legacy telemetry projection omits record traces and retains only operator-compatible provenance labels; a no-kit observation has no game telemetry projection.'],
  };
}

export function compareObservations(current, baseline) {
  const result = { differences: {}, causalSavings: 'not-established' };
  if (!baseline) return { ...result, status: 'missing-baseline' };
  if (current.protocol.compatibility !== baseline.protocol.compatibility) return { ...result, status: 'incompatible-protocol' };
  if (current.outcome.status !== 'accepted' || baseline.outcome.status !== 'accepted') return { ...result, status: 'unaccepted-outcome' };
  for (const key of metricKeys) if (current.telemetry[key].evidenceStatus === 'record-traced' && baseline.telemetry[key].evidenceStatus === 'record-traced') result.differences[key] = baseline.telemetry[key].value - current.telemetry[key].value;
  return { ...result, status: Object.keys(result.differences).length ? 'comparable' : 'no-record-traced-pairs', basis: 'supplied-source-records' };
}

export function main(args) {
  const index = args.indexOf('--baseline');
  const files = index < 0 ? args : args.slice(0, index);
  if (!files.length || files.some(file => file.startsWith('--')) || (index >= 0 && (files.length !== 1 || index !== args.length - 2 || args.at(-1).startsWith('--')))) throw new Error('usage: observations.mjs <observation.json> [...] [--baseline <observation.json>]');
  const all = [...files, ...(index < 0 ? [] : [args.at(-1)])].map(importObservation);
  const observations = new Set(), records = new Set(), hashes = new Set();
  for (const observed of all) {
    unique(observations, observed.identity.observationId, 'observation');
    for (const source of observed.sources) { unique(records, source.recordId, 'source record'); unique(hashes, source.sha256, 'source record'); }
  }
  const baseline = index < 0 ? null : all.pop();
  console.log(JSON.stringify({ version: 1, observations: all, ...(baseline ? { baseline } : {}), comparison: compareObservations(all[0], baseline) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
