import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { fuzzMain, playOne, report, runGames, runResumable, wholeGame, type SimRecord } from './index.ts';
import { simGame } from './fake/trigger-cap.ts';

const seed = 'cap-seed';
const spec = { index: 0, seed, driver: 'random' };
const module = new URL('./fake/trigger-cap.ts', import.meta.url).href;

it('rejects a truncated chain at the action that dropped work, before a later win', async () => {
  const lines: string[] = [];
  expect(await fuzzMain(['--seed', seed], module, { whole: true }, (line) => lines.push(line))).toBe(1);
  expect(lines.join('\n')).toContain('--seed cap-seed --driver random --until 1');
  const rec = playOne(simGame, null, spec);
  expect(rec).toMatchObject({ result: null, actions: 1, triggerCap: { actionIndex: 0, remaining: 1 }, log: [{ kind: 'answer' }] });
  expect(playOne(simGame, null, spec, 1)).toEqual(rec);
});

it('keeps paused runs out of clean results and their win and length denominators', () => {
  const paused = playOne(simGame, null, spec, 0);
  const clean = { ...spec, hash: 'clean', result: 0, actions: 2 };
  const capped = playOne(simGame, null, spec);
  const records = [clean, paused, capped, { ...clean, hash: 'crashed', result: null, errorName: 'timeout' }, { ...clean, result: null, violations: [{ id: 'rule', message: 'broken' }] }];
  expect(report([paused]).completed).toBe(0);
  expect(report(records)).toMatchObject({
    completed: 1, unfinished: 1, truncated: 1, failures: { timeout: 1, violation: 1 },
    winShareBySeat: { '0': 1 }, length: { min: 2, median: 2, max: 2 },
  });
  expect(wholeGame({ records, findings: [] }).groups[0]).toMatchObject({ started: 5, finished: 1 });
});

it('rechecks a legacy checkpoint and retains the fresh worker failure for resume', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trigger-cap-checkpoint-'));
  try {
    const file = join(dir, 'checkpoint.jsonl');
    const label = 'fixture';
    writeFileSync(file, JSON.stringify({ settings: label, record: { ...spec, result: 'legacy clean', actions: 2, hash: 'legacy' } }) + '\n');
    const request = { module, specs: [spec], fresh: true };
    const [fresh] = await runResumable(request, 2, file, label);
    expect(fresh).toMatchObject({ result: null, triggerCap: { actionIndex: 0 } });
    const reused: SimRecord[] = [];
    expect(await runResumable(request, 2, file, label, (r) => reused.push(r))).toEqual([fresh]);
    expect(reused).toHaveLength(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('fails a stale bundled worker that supplies a result without current trigger-cap evidence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stale-worker-'));
  try {
    const worker = join(dir, 'stale.mjs');
    writeFileSync(worker, `
import { parentPort } from 'node:worker_threads';
parentPort.on('message', (message) => {
  if (message.type === 'stop') parentPort.close();
  else parentPort.postMessage({ type: 'record', record: { ...message.spec, result: 'legacy clean', actions: 2, hash: 'legacy' } });
});
parentPort.postMessage({ type: 'ready' });
`);
    const [record] = await runGames({ module, specs: [spec], fresh: true, worker: pathToFileURL(worker).href }, 1);
    expect(record?.result).toBeNull();
    expect(record?.error).toContain('rebuild the worker bundle');
    expect(report([record!]).completed).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
