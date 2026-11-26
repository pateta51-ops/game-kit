import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { afterAll, expect, it } from 'vitest';
import { runGames, runResumable, type SimRecord } from './index.ts';
import { executionKind } from './pool.ts';

const dir = mkdtempSync(join(tmpdir(), 'port-resume-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const module = new URL('./fake/port-game.ts', import.meta.url).href;
const spec = { index: 0, seed: 'a', driver: 'random' };
const checkpoint = (name: string, record: SimRecord): string => {
  const file = join(dir, `${name}.jsonl`);
  writeFileSync(file, JSON.stringify({ settings: 'fixture', record }) + '\n');
  return file;
};

it('resumes current port records, checks all driver registrations, and requires actual view evidence', async () => {
  const [record] = await runGames({ module, specs: [spec], view: true }, 1);
  const file = checkpoint('port', record!);
  const played: SimRecord[] = [];
  expect(await runResumable({ module, specs: [spec], view: true }, 2, file, 'fixture', r => played.push(r))).toEqual([record]);
  expect(played).toEqual([]);
  await expect(runResumable({ module, specs: [spec], preflightDriverNames: ['unknown'] }, 1, file, 'fixture')).rejects.toThrow(/unknown port driver/);
  const oldView = { ...record! }; delete oldView.viewValidation;
  await expect(runResumable({ module, specs: [spec], view: true }, 2, checkpoint('old-view', oldView), 'fixture')).rejects.toThrow(/lacks executed view checks/);
});

it('refuses unsupported port options even with completed checkpoint records', async () => {
  const file = join(dir, 'unsupported-checkpoint.jsonl');
  const request = { module, specs: [spec], fresh: true };
  const [completed] = await runResumable(request, 1, file, 'fixture');
  expect(completed?.result).toMatchObject({ winner: 'actor' });
  const undoModule = join(dir, 'unsupported-undo.mjs');
  writeFileSync(undoModule, `import { simGame as base } from ${JSON.stringify(module)}; export const simGame = { ...base, undoCheck: true };`);
  for (const overrides of [{ hidden: true }, { debug: 1 }, { hasten: 1 }, { module: pathToFileURL(undoModule).href }]) {
    const [rejected] = await runResumable({ ...request, ...overrides }, 1, file, 'fixture');
    expect(rejected).toMatchObject({ result: null, actions: 0 });
    expect(rejected?.error).toContain('does not support');
  }
  const played: SimRecord[] = [];
  expect(await runResumable(request, 1, file, 'fixture', record => played.push(record))).toEqual([completed]);
  expect(played).toEqual([]);
});

it('replays a port checkpoint with only kernel evidence and a kernel checkpoint with only port evidence', async () => {
  const legacy = { ...spec, result: 'not checked', actions: 2, hash: 'legacy' };
  const played: SimRecord[] = [];
  const records = await runResumable({ module, specs: [spec], fresh: true, view: true }, 2,
    checkpoint('wrong-kernel-evidence', { ...legacy, triggerCapChecked: true }), 'fixture', r => played.push(r));
  expect(played).toHaveLength(1);
  expect(records[0]).toMatchObject({ portExecution: 1, actions: 3, result: { winner: 'actor' } });
  const cappedModule = new URL('./fake/trigger-cap.ts', import.meta.url).href;
  const capped = await runResumable({ module: cappedModule, specs: [spec], fresh: true }, 2,
    checkpoint('wrong-port-evidence', { ...legacy, portExecution: 1 }), 'fixture');
  expect(capped[0]).toMatchObject({ result: null, triggerCapChecked: true, triggerCap: { actionIndex: 0 } });
});

it('does not let a record marker change a selected worker execution kind', async () => {
  const worker = join(dir, 'stale-worker.mjs');
  for (const port of [false, true]) {
    writeFileSync(worker, `
import { parentPort } from 'node:worker_threads';
parentPort.on('message', message => {
  if (message.type === 'stop') parentPort.close();
  else parentPort.postMessage({ type: 'record', record: { ...message.spec, result: 'stale', actions: 1, hash: 'stale', ${port ? 'triggerCapChecked: true' : 'portExecution: 1'} } });
});
parentPort.postMessage({ type: 'ready', ${port ? "engine: 'port'" : ''} });
`);
    const [record] = await runGames({ module, specs: [spec], fresh: true, worker: pathToFileURL(worker).href }, 1);
    expect(record?.result).toBeNull();
    expect(record?.error).toContain(port ? 'current EnginePort execution evidence' : 'trigger-cap validation');
    expect(await executionKind({ module, worker: pathToFileURL(worker).href })).toBeUndefined();
  }
});

it('contains a failed or stalled inspection in a worker and returns unknown evidence', async () => {
  expect(await executionKind({ module: new URL('./fake/broken.ts', import.meta.url).href })).toBeUndefined();
  expect(await executionKind({ module, worker: 'not-a-url' })).toBeUndefined();
  const hanging = join(dir, 'hanging.mjs');
  writeFileSync(hanging, 'for (;;) {}');
  expect(await executionKind({ module: pathToFileURL(hanging).href, gameTimeoutMs: 100 })).toBeUndefined();
});

it('reuses a current port checkpoint through a bundled simulator and explicit worker', async () => {
  const bundle = join(dir, 'sim.mjs'), worker = join(dir, 'worker.mjs'), file = join(dir, 'bundle.jsonl'), command = join(dir, 'run.mjs');
  const engine = new URL('../engine-core/index.ts', import.meta.url).href;
  const sharedEngine: Plugin = { name: 'shared-engine', setup(b) {
    b.onResolve({ filter: /^\.\.\/engine-core\/index\.ts$/ }, () => ({ path: engine, external: true }));
  } };
  await Promise.all([
    build({ entryPoints: [fileURLToPath(new URL('./index.ts', import.meta.url))], outfile: bundle, bundle: true, format: 'esm', platform: 'node', plugins: [sharedEngine] }),
    build({ entryPoints: [fileURLToPath(new URL('./worker.ts', import.meta.url))], outfile: worker, bundle: true, format: 'esm', platform: 'node', plugins: [sharedEngine] }),
  ]);
  writeFileSync(command, `
import { runResumable } from ${JSON.stringify(pathToFileURL(bundle).href)};
const request = ${JSON.stringify({ module, specs: [spec], fresh: true, worker: pathToFileURL(worker).href })};
const first = await runResumable(request, 2, ${JSON.stringify(file)}, 'bundle');
if (first.length !== 1 || first[0]?.actions !== 3 || JSON.stringify(first[0]?.result) !== JSON.stringify({ winner: 'actor', score: 4 })) throw new Error(JSON.stringify(first));
let replayed = 0;
const second = await runResumable(request, 2, ${JSON.stringify(file)}, 'bundle', () => replayed++);
console.log(JSON.stringify({ equal: JSON.stringify(first) === JSON.stringify(second), replayed }));
`);
  const run = spawnSync(process.execPath, [command], { encoding: 'utf8', timeout: 10_000 });
  expect(run.status, run.stdout + run.stderr).toBe(0);
  expect(JSON.parse(run.stdout) as unknown).toEqual({ equal: true, replayed: 0 });
});
