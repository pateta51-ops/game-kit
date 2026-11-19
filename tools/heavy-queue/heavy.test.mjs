import { afterEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHeavy, procScan, startServer } from './server.mjs';

const HEAVY = fileURLToPath(new URL('./heavy.mjs', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 20000) => { const t = Date.now(); while (!(await f())) { if (Date.now() - t > ms) throw new Error('timed out waiting'); await sleep(25); } };
const servers = [];
afterEach(() => { for (const s of servers.splice(0)) s.close(); });
async function serve(o) {
  const s = startServer({ port: 0, tick: 50, sweepMs: 0, ...o });
  servers.push(s);
  await once(s, 'listening');
  const url = `http://127.0.0.1:${s.address().port}`;
  const post = async (p, b) => (await fetch(url + p, { method: 'POST', body: JSON.stringify(b) })).json();
  const status = async () => (await fetch(url + '/status')).json();
  return { s, url, post, status };
}
async function deadUrl() {
  const s = createServer().listen(0, '127.0.0.1');
  await once(s, 'listening');
  const { port } = s.address();
  s.close();
  return `http://127.0.0.1:${port}`;
}
function heavy(args, env) {
  const c = spawn(process.execPath, [HEAVY, ...args], { env: { ...process.env, HEAVY_HELD: '', HEAVY_POLL: '50', HEAVY_BEAT: '50', ...env } });
  let err = '', out = '';
  c.stdout.on('data', (d) => (out += d));
  c.stderr.on('data', (d) => (err += d));
  return Object.assign(new Promise((r) => c.on('exit', (code) => r({ code, err }))), { c, out: () => out });
}

describe('heavy-queue server (K399)', () => {
  it('runs N slots, high before normal, FIFO within a priority', async () => {
    const q = await serve({ slots: 2 });
    const a = await q.post('/acquire', { label: 'a' });
    const b = await q.post('/acquire', { label: 'b' });
    const c = await q.post('/acquire', { label: 'c' });
    const d = await q.post('/acquire', { label: 'd', priority: 'high' });
    const e = await q.post('/acquire', { label: 'e', priority: 'high' });
    expect([a.granted, b.granted, c.granted, d.granted]).toEqual([true, true, false, false]);
    expect([(await q.post('/beat', { id: c.id })).ahead, d.ahead, e.ahead]).toEqual([2, 0, 1]);
    await q.post('/release', { id: a.id, exit: 0 });
    expect((await q.post('/beat', { id: d.id })).granted).toBe(true);
    expect((await q.post('/beat', { id: c.id })).granted).toBe(false);
    await q.post('/release', { id: b.id, exit: 1 });
    expect((await q.post('/beat', { id: e.id })).granted).toBe(true);
    expect((await q.post('/beat', { id: c.id })).granted).toBe(false);
    const s = await q.status();
    expect(s.running.map((l) => l.label)).toEqual(['d', 'e']);
    expect(s.history.map((h) => h.exit)).toEqual([1, 0]);
    expect(await (await fetch(q.url + '/')).text()).toContain('Running (2/2)');
  });
  it('a normal run that waited past age ranks with high ones', async () => {
    const q = await serve({ slots: 1, age: 150 });
    const a = await q.post('/acquire', { label: 'a' });
    const n = await q.post('/acquire', { label: 'n' });
    await sleep(200);
    const h = await q.post('/acquire', { label: 'h', priority: 'high' });
    expect([a.granted, n.granted, h.granted, h.ahead]).toEqual([true, false, false, 1]);
    await q.post('/release', { id: a.id, exit: 0 });
    expect((await q.post('/beat', { id: n.id })).granted).toBe(true);
    expect((await q.post('/beat', { id: h.id })).granted).toBe(false);
  });
  it('frees a lease whose heartbeats stop', async () => {
    const q = await serve({ ttl: 1000 });
    const a = await q.post('/acquire', { label: 'a' });
    const b = await q.post('/acquire', { label: 'b' });
    expect(b.granted).toBe(false);
    await until(async () => { await sleep(50); return (await q.post('/beat', { id: b.id })).granted; });
    expect((await q.post('/beat', { id: b.id })).granted).toBe(true);
    expect((await q.post('/beat', { id: a.id })).error).toBe('lease ended');
    expect((await q.post('/beat', { id: 'nope' })).error).toBe('unknown lease');
    expect((await q.status()).history[0]).toMatchObject({ label: 'a', reason: 'no heartbeat' });
  });
  it('frees a lease whose watched pid dies', async () => {
    const q = await serve({});
    const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)']);
    await q.post('/acquire', { label: 'job', pid: c.pid });
    expect((await q.status()).running).toHaveLength(1);
    c.kill();
    await once(c, 'exit');
    await until(async () => (await q.status()).running.length === 0);
    expect((await q.status()).running).toHaveLength(0);
    expect((await q.status()).history[0]).toMatchObject({ label: 'job', reason: 'pid gone' });
  });
});

describe('heavy run (K399)', () => {
  it('waits for its slot, passes the exit code through and records it', async () => {
    const q = await serve({});
    const hold = await q.post('/acquire', { label: 'other' });
    const run = heavy(['run', '--label', 'mine', '--', process.execPath, '-e', 'process.exit(process.env.HEAVY_HELD === "1" ? 5 : 1)'], { HEAVY_URL: q.url });
    await until(async () => (await q.status()).waiting.length === 1);
    expect((await q.status()).waiting.map((l) => l.label)).toEqual(['mine']);
    await q.post('/release', { id: hold.id });
    const r = await run;
    expect(r.code).toBe(5);
    expect(r.err).toContain('waiting for a slot');
    expect((await q.status()).history[0]).toMatchObject({ label: 'mine', exit: 5 });
  });
  it('passes through with HEAVY_HELD=1, no queue asked', async () => {
    const r = await heavy(['run', '--', process.execPath, '-e', 'process.exit(7)'], { HEAVY_URL: await deadUrl(), HEAVY_HELD: '1' });
    expect(r).toEqual({ code: 7, err: '' });
  });
  it.skipIf(process.platform === 'win32')('falls back to flock on the lock file when the server is down', async () => {
    const lock = join(mkdtempSync(join(tmpdir(), 'k399-')), 'q.lock');
    const holder = spawn('flock', [lock, 'sh', '-c', 'echo held; sleep 2']);
    let held = '';
    holder.stdout.on('data', (d) => (held += d));
    await until(() => held.includes('held'));
    const r = await heavy(['run', '--', process.execPath, '-e', 'process.exit(3)'], { HEAVY_URL: await deadUrl(), HEAVY_LOCK: lock });
    expect(r.code).toBe(3);
    expect(r.err).toContain(`holding ${lock}`);
    expect(holder.exitCode).not.toBeNull();
    holder.kill();
  });
});

describe('heavy-queue review fixes (K399)', () => {
  const win = process.platform === 'win32';
  const stop = (s) => { s.close(); s.closeAllConnections(); };
  it('a running client takes its lease again after the queue restarts', async () => {
    const q = await serve({});
    const port = q.s.address().port;
    const run = heavy(['run', '--label', 'long', '--', process.execPath, '-e', 'setTimeout(() => {}, 4000)'], { HEAVY_URL: q.url });
    await until(async () => (await q.status()).running.length === 1);
    stop(q.s);
    const s2 = startServer({ port, tick: 50 });
    servers.push(s2);
    await once(s2, 'listening');
    await until(async () => (await (await fetch(q.url + '/status')).json()).running.length === 1);
    expect((await (await fetch(q.url + '/status')).json()).running.map((l) => l.label)).toEqual(['long']);
    expect((await run).code).toBe(0);
    expect((await (await fetch(q.url + '/status')).json()).history[0]).toMatchObject({ label: 'long', exit: 0 });
  });
  it.skipIf(win)('a waiting client falls back to flock when the queue stops answering', async () => {
    const q = await serve({});
    await q.post('/acquire', { label: 'other' });
    const lock = join(mkdtempSync(join(tmpdir(), 'k399-')), 'q.lock');
    const run = heavy(['run', '--', process.execPath, '-e', 'process.exit(3)'], { HEAVY_URL: q.url, HEAVY_LOCK: lock, HEAVY_GIVEUP: '300' });
    await until(async () => (await q.status()).waiting.length === 1);
    await sleep(100);
    stop(q.s);
    const r = await run;
    expect(r.code).toBe(3);
    expect(r.err).toMatch(/waiting for a slot[^]*queue stopped answering[^]*holding/);
  });
  it.skipIf(win)('forwards SIGHUP to the command', async () => {
    const run = heavy(['run', '--', process.execPath, '-e', 'process.on("SIGHUP", () => process.exit(9)); console.log("ready"); setInterval(() => {}, 1000)'], { HEAVY_HELD: '1' });
    while (!run.out().includes('ready')) await sleep(50);
    run.c.kill('SIGHUP');
    expect((await run).code).toBe(9);
  });
  it.skipIf(win)('gate-slot.sh hands the run to heavy, which passes through with HEAVY_HELD=1', async () => {
    const bin = mkdtempSync(join(tmpdir(), 'k399-bin-'));
    symlinkSync(fileURLToPath(new URL('./heavy', import.meta.url)), join(bin, 'heavy'));
    const gs = fileURLToPath(new URL('../../components/ci-templates/gate-slot.sh', import.meta.url));
    const c = spawn('bash', [gs, process.execPath, '-e', 'process.exit(process.env.HEAVY_HELD === "1" ? 6 : 1)'], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HEAVY_HELD: '1', HEAVY_URL: await deadUrl(), GATE_DIR: '/proc/k399-no' } });
    const [code] = await once(c, 'exit');
    expect(code).toBe(6);
  });
  it.skipIf(win)('install-runner-hooks.sh adds the hooks once, after a .env without a final newline', () => {
    const home = mkdtempSync(join(tmpdir(), 'k399-home-'));
    const hq = join(home, 'hq');
    mkdirSync(hq);
    writeFileSync(join(hq, 'runner-job-started.sh'), '');
    chmodSync(join(hq, 'runner-job-started.sh'), 0o755);
    const d = join(home, 'actions-runner-a');
    mkdirSync(d);
    writeFileSync(join(d, '.env'), 'LANG=C.UTF-8');
    writeFileSync(join(d, '.service'), 'unit-a.service');
    const sh = fileURLToPath(new URL('./install-runner-hooks.sh', import.meta.url));
    const go = () => spawnSync('bash', [sh], { encoding: 'utf8', env: { ...process.env, HOME: home, HEAVY_HOME: hq, SYSTEMCTL: 'echo systemctl' } }).stdout;
    expect(go()).toContain('actions-runner-a: hooks set, unit-a.service restarted');
    const env = `LANG=C.UTF-8\nACTIONS_RUNNER_HOOK_JOB_STARTED=${hq}/runner-job-started.sh\nACTIONS_RUNNER_HOOK_JOB_COMPLETED=${hq}/runner-job-completed.sh\n`;
    expect(readFileSync(join(d, '.env'), 'utf8')).toBe(env);
    expect(go()).toBe('actions-runner-a: hooks already set\n');
    expect(readFileSync(join(d, '.env'), 'utf8')).toBe(env);
  });
});

describe('heavy-queue sweep (K418)', () => {
  it('lists and renices unqueued heavy runs once; ignores held and runner ones; drops ended', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hq-sweep-'));
    let procs = [
      { pid: 11, cmd: 'vitest run', cwd: '/g/a', held: true },
      { pid: 12, cmd: 'playwright test', cwd: '/g/b', runner: true },
      { pid: 13, cmd: 'pytest', cwd: '/g/c' },
    ];
    const reniced = [];
    const { status } = await serve({ scan: () => procs, renice: (p) => reniced.push(p), sweepMs: 30, log: join(dir, 'bypass.log') });
    await until(async () => (await status()).unqueued.length === 1);
    const s = await status();
    expect(s.unqueued.map((u) => u.pid)).toEqual([13]);
    expect(s.unqueued[0].cwd).toBe('/g/c');
    expect(reniced).toEqual([13]);
    expect(readFileSync(join(dir, 'bypass.log'), 'utf8')).toContain('pid 13 cwd /g/c');
    procs = procs.filter((p) => p.pid !== 13);
    await until(async () => (await status()).unqueued.length === 0);
    expect(reniced).toEqual([13]);
  });
  it('HEAVY_SWEEP_MS 0 turns the sweep off', async () => {
    let calls = 0;
    const { status } = await serve({ scan: () => { calls++; return []; }, sweepMs: 0 });
    await sleep(150);
    expect(calls).toBe(0);
    expect((await status()).unqueued).toEqual([]);
  });
});

describe('heavy-queue process matching (K418)', () => {
  const sp = (s) => s.split(' ');
  it('flags only node/python test tools and headless chromium', () => {
    for (const c of ['node /g/node_modules/.bin/vitest run', 'node /g/node_modules/playwright/cli.js test', 'python3 -m pytest -q', 'node /g/node_modules/vite/bin/vite.js build', 'node /g/node_modules/typescript/bin/tsc -b', '/opt/chrome/chrome --headless=new --no-sandbox']) expect(isHeavy(sp(c)), c).toBe(true);
    for (const c of ['vim vitest.config.ts', 'git commit -m fix-vitest', 'node /g/node_modules/typescript/lib/tsserver.js', 'pylsp', 'node /g/node_modules/@playwright/mcp/cli.js', 'node /g/node_modules/vite/bin/vite.js dev', 'bash -c vitest', '/opt/chrome/chrome --no-sandbox']) expect(isHeavy(sp(c)), c).toBe(false);
  });
  it.skipIf(process.platform === 'win32')('procScan reads a fake /proc: NUL split, runner ancestor, unreadable environ', () => {
    const root = mkdtempSync(join(tmpdir(), 'hq-proc-'));
    const mk = (pid, ppid, args, env) => {
      mkdirSync(join(root, String(pid)));
      writeFileSync(join(root, String(pid), 'cmdline'), args.join('\0') + '\0');
      writeFileSync(join(root, String(pid), 'stat'), `${pid} (node) S ${ppid} 0 0`);
      if (env !== null) writeFileSync(join(root, String(pid), 'environ'), env.join('\0') + '\0');
    };
    mk(50, 1, ['Runner.Worker'], null);
    mk(100, 50, ['node', '/g/node_modules/.bin/vitest', 'run'], ['A=1']);
    mk(200, 1, ['node', '/g/node_modules/.bin/vitest'], null);
    mk(300, 1, ['node', '/g/node_modules/.bin/vitest'], ['HEAVY_HELD=1', 'B=2']);
    mk(400, 1, ['node', '/g/node_modules/.bin/playwright', 'test'], ['B=2']);
    mk(500, 1, ['vim', 'vitest.config.ts'], ['B=2']);
    const r = procScan(root).sort((a, b) => a.pid - b.pid).map(({ pid, held, runner, cmd }) => ({ pid, held, runner, cmd }));
    expect(r).toEqual([
      { pid: 100, held: false, runner: true, cmd: 'node /g/node_modules/.bin/vitest run' },
      { pid: 300, held: true, runner: false, cmd: 'node /g/node_modules/.bin/vitest' },
      { pid: 400, held: false, runner: false, cmd: 'node /g/node_modules/.bin/playwright test' },
    ]);
  });
});
