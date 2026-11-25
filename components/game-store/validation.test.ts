import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { SimRecord } from '../sim-pool/index.ts';

const dir = mkdtempSync(join(tmpdir(), 'sim-validation-'));
const fixture = fileURLToPath(new URL('./validation.cli.fixture.ts', import.meta.url));
const bundle = join(dir, 'worker.mjs');
const engine = new URL('../engine-core/index.ts', import.meta.url);
beforeAll(async () => {
  await build({
    entryPoints: [fileURLToPath(new URL('../sim-pool/worker.ts', import.meta.url))],
    outfile: bundle, bundle: true, platform: 'node', format: 'esm',
    plugins: [{ name: 'shared-engine', setup(b) {
      b.onResolve({ filter: /^\.\.\/engine-core\/index\.ts$/ }, () => ({ path: engine.href, external: true }));
    } }],
  });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function probe(id: string, args: string[], env: Record<string, string> = {}) {
  const events = join(dir, `${id}.jsonl`);
  writeFileSync(events, '');
  const child = spawnSync(process.execPath, [fixture, ...args], {
    encoding: 'utf8', timeout: 20_000, env: { ...process.env, PROBE_EVENTS: events, ...env },
  });
  expect(child.error).toBeUndefined();
  expect(child.signal).toBeNull();
  const trace = readFileSync(events, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as unknown[]);
  if (process.env.PROBE_REPORT === '1') process.stdout.write(`${JSON.stringify({ id, args, exit: child.status, stdout: child.stdout, stderr: child.stderr, trace })}\n`);
  return { ...child, trace };
}
const records = (stdout: string) => JSON.parse(stdout) as SimRecord[];
const cli = (driver: string, workers = '2') => ['--games', '2', '--workers', workers, '--driver', driver];

it.each(['opponent', 'bot'])('validates the exact two-argument %s view before giving it to the policy', (driver) => {
  for (const workers of ['1', '2']) {
    const safe = probe(`safe-${driver}-${workers}`, cli(driver, workers), { PROBE_VIEW: '1' });
    expect(safe.status, safe.stderr).toBe(0);
    expect(safe.stdout).toMatch(/2 game\(s\), 6 actions checked: exceptions 0/);
    const bad = probe(`leak-${driver}-${workers}`, cli(driver, workers), { PROBE_VIEW: '1', PROBE_MODE: 'context-leak' });
    expect.soft(bad.status, bad.stdout + bad.stderr).toBe(1);
    expect.soft(bad.stdout).toMatch(/view.*seat b.*view leak: ONLY_A/);
    expect.soft(bad.trace.filter(e => e[0] === 'decision')).toHaveLength(2);
    expect.soft(safe.trace.filter(e => e[0] === 'assertion')).toHaveLength(2 * (2 * 4 + 3));
  }
  const leaked = probe(`records-${driver}`, ['--probe-games', '2', driver], { PROBE_VIEW: '1', PROBE_MODE: 'context-leak' });
  expect(leaked.status, leaked.stderr).toBe(0);
  for (const record of records(leaked.stdout)) {
    expect(record).toMatchObject({ driver, resolvedDriver: driver === 'bot' ? 'public-bot' : driver, result: null, actions: 1, viewValidation: { status: 'failed', checked: 5 } });
  }
}, 30_000);

it('keeps disabled view and RNG callbacks and deterministic records at one and three workers', () => {
  for (const driver of ['opponent', 'bot']) {
    const args = ['--probe-games', '1', driver];
    const one = probe(`disabled-${driver}-1`, args, { PROBE_MODE: 'context-leak' });
    const three = probe(`disabled-${driver}-3`, ['--probe-games', '3', driver], { PROBE_MODE: 'context-leak' });
    expect([one.status, three.status], one.stderr + three.stderr).toEqual([0, 0]);
    expect(three.stdout).toBe(one.stdout);
    for (const record of records(one.stdout)) expect(record).toMatchObject({ actions: 3, result: { kind: 'won' }, viewValidation: { status: 'skipped', checked: 0 } });
    const policy = (trace: unknown[][]) => trace.filter(e => e[0] === 'decision' || e[0] === 'view').map(e => JSON.stringify(e)).sort();
    expect(policy(three.trace)).toEqual(policy(one.trace));
    expect(one.trace.filter(e => e[0] === 'view')).toHaveLength(18);
    expect(one.trace.filter(e => e[0] === 'assertion' || e[0] === 'view' && e[3] !== null)).toEqual([]);
    if (driver === 'opponent') expect(one.trace.filter(e => e[0] === 'decision' && e[1] === 'b').map(e => e[3])).toEqual(Array(6).fill('two'));
  }
}, 30_000);

it('preserves debug context, snapshot subsets and legacy assertion precedence at the driver boundary', () => {
  const debug = probe('debug', [...cli('opponent', '1'), '--debug', '1'], { PROBE_VIEW: '1', PROBE_MODE: 'subset' });
  expect(debug.status, debug.stdout + debug.stderr).toBe(0);
  const views = debug.trace.filter(e => e[0] === 'view');
  expect(views.filter(e => e[3] !== null).every(e => e[2] === 'b')).toBe(true);
  expect(views).toContainEqual(['view', 1, 'b', { undoUsed: false, cheated: false }]);
  expect(views).toContainEqual(['view', 2, 'b', { undoUsed: false, cheated: true }]);
  expect(views).toContainEqual(['view', 2, 'b', null]);
  expect(views).toContainEqual(['view', 1, 'a', null]);
  const legacy = probe('legacy', cli('opponent', '1'), { PROBE_VIEW: '1', PROBE_MODE: 'legacy' });
  expect(legacy.status, legacy.stdout + legacy.stderr).toBe(1);
  expect(legacy.stdout).toMatch(/driver seat b.*view leak: ONLY_B/);
  expect(legacy.trace.every(e => e[0] !== 'assertion' && (e[0] !== 'view' || e[3] === null))).toBe(true);
  const wrapped = probe('wrapped', cli('wrapped'), { PROBE_VIEW: '1', PROBE_MODE: 'context-leak' });
  expect(wrapped.status, wrapped.stdout + wrapped.stderr).toBe(1);
  expect(wrapped.stdout).toMatch(/driver seat b.*view leak: ONLY_A/);
}, 30_000);

it('uses existing per-seat assertions from a generic SimGame at the actual bot boundary', () => {
  const generic = probe('generic', cli('bot', '1'), { PROBE_VIEW: '1', PROBE_MODE: 'generic' });
  expect(generic.status, generic.stdout + generic.stderr).toBe(1);
  expect(generic.stdout).toMatch(/driver seat b.*view leak: ONLY_A/);
  expect(generic.trace.filter(e => e[0] === 'view' && e[3] === null)).toHaveLength(4);
}, 30_000);

const historical = (driver: string, seed: string) => `${JSON.stringify({ settings: 'compatible', record: { index: 1, driver, seed, result: { kind: 'won' }, actions: 3, hash: 'historical' } })}\n`;
const executable = () => pathToFileURL(bundle).href;
it.each(['source', 'bundle'])('preflights invalid registrations including cached successes using the %s worker', (kind) => {
  const worker: Record<string, string> = kind === 'bundle' ? { PROBE_WORKER: executable() } : {};
  const invalid = probe(`${kind}-invalid-cli`, cli('gredey'), worker);
  const valid = probe(`${kind}-valid-cli`, cli('alias'), worker);
  expect(valid.status, valid.stderr).toBe(0);
  expect(valid.stdout).toMatch(/2 game\(s\), 6 actions checked: exceptions 0/);
  for (const scenario of ['fresh', 'partial', 'cached']) {
    const file = join(dir, `${kind}-${scenario}-checkpoint.jsonl`);
    const before = historical('gredey', 'historical');
    if (scenario !== 'fresh') writeFileSync(file, before);
    const outcome = probe(`${kind}-${scenario}`, ['--probe-batch', scenario], scenario === 'fresh' ? worker : { ...worker, PROBE_CHECKPOINT: file });
    expect(outcome.trace.some(e => e[0] === 'content' || e[0] === 'setup')).toBe(false);
    expect(outcome.trace.some(e => e[0] === 'registration' && e[1] === 'gredey')).toBe(true);
    if (scenario !== 'fresh') expect(readFileSync(file, 'utf8')).toBe(before);
    expect.soft(outcome.status, outcome.stdout + outcome.stderr).toBe(2);
    expect.soft(outcome.stdout).toMatch(/unknown driver "gredey"/);
  }
  expect(invalid.status, invalid.stdout + invalid.stderr).toBe(2);
  expect(invalid.stdout).toMatch(/unknown driver "gredey"/);
  expect(invalid.trace.some(e => e[0] === 'content' || e[0] === 'setup')).toBe(false);
}, 30_000);

it('keeps valid source and rebuilt bundles equivalent and propagates unrelated all-cached failures', () => {
  const args = ['--probe-batch', 'valid'];
  const source = probe('source-valid', args);
  const worker = { PROBE_WORKER: executable() };
  const bundled = probe('bundle-valid', args, worker);
  expect([source.status, bundled.status], source.stderr + bundled.stderr).toEqual([0, 0]);
  expect(bundled.stdout).toBe(source.stdout);
  expect(records(source.stdout)).toMatchObject([
    { driver: 'alias', resolvedDriver: 'opponent' },
    { driver: 'unnamed', resolvedDriver: 'grouped' },
    { driver: 'bot', resolvedDriver: 'public-bot' },
  ]);
  const file = join(dir, 'run.jsonl');
  const before = historical('gredey', 'historical');
  writeFileSync(file, before);
  const runtime = probe('bundle-runtime', ['--probe-batch', 'cached'], { ...worker, PROBE_CHECKPOINT: file, PROBE_MODE: 'runtime-preflight' });
  expect(runtime.status, runtime.stdout + runtime.stderr).toBe(1);
  expect(runtime.stdout).toMatch(/unrelated preflight failure/);
  expect(readFileSync(file, 'utf8')).toBe(before);
  const old = historical('unnamed', 'probe-1');
  writeFileSync(file, old);
  const stale = probe('bundle-old-evidence', ['--probe-batch', 'old-evidence'], { ...worker, PROBE_CHECKPOINT: file, PROBE_VIEW: '1' });
  expect(stale.status).toBe(1);
  expect(stale.stdout).toMatch(/checkpoint lacks executed view checks/);
  expect(stale.trace).toEqual([]);
  expect(readFileSync(file, 'utf8')).toBe(old);
}, 30_000);
