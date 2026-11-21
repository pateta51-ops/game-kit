import { afterEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cachedGB, isHeavy, procScan, startServer } from './server.mjs';

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
  it.skipIf(win)('K478: the runner hook passes a light job (changes) through with no slot; completed tolerates the missing lease', () => {
    const d = mkdtempSync(join(tmpdir(), 'k478-'));
    const hq = fileURLToPath(new URL('.', import.meta.url));
    const bin = join(d, 'bin'), log = join(d, 'log');
    mkdirSync(bin);
    for (const t of ['node', 'flock']) { writeFileSync(join(bin, t), `#!/bin/sh\necho ${t} "$@" >> ${log}\nexit ${t === 'node' ? 1 : 0}\n`); chmodSync(join(bin, t), 0o755); }
    const go = (sh, job, light) => spawnSync('bash', [join(hq, sh)], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_JOB: job, GITHUB_ENV: join(d, 'env'), RUNNER_NAME: 'k478-none', ...(light ? { HEAVY_LIGHT_JOBS: light } : {}) } });
    const nl = String.fromCharCode(10);
    for (const job of ['changes', 'docs']) {
      writeFileSync(join(d, 'env'), '');
      const r = go('runner-job-started.sh', job);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain(`[heavy] job ${job}`);
      expect(readFileSync(join(d, 'env'), 'utf8')).toBe(`HEAVY_HELD=1${nl}`);
      expect(existsSync(log)).toBe(false);
    }
    writeFileSync(join(d, 'env'), '');
    expect(go('runner-job-started.sh', 'lint').status).toBe(0);
    expect(readFileSync(log, 'utf8')).toMatch(/node .*hold[^]*flock/);
    rmSync(log);
    expect(go('runner-job-started.sh', 'changes', 'lint').status).toBe(0);
    expect(readFileSync(log, 'utf8')).toContain('hold');
    expect(go('runner-job-completed.sh', 'changes').status).toBe(0);
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

describe('heavy-queue worker cap and load (K454)', () => {
  it('reports workers = cores / slots (at least 1) and a job gets HEAVY_WORKERS', async () => {
    const q = await serve({ slots: 2, cores: 16 });
    const s = await q.status();
    expect([s.cores, s.workers]).toEqual([16, 8]);
    expect((await q.post('/acquire', { label: 'a' })).workers).toBe(8);
    expect((await (await serve({ slots: 4, cores: 2 })).status()).workers).toBe(1);
    const r = await heavy(['run', '--', process.execPath, '-e', 'process.exit(Number(process.env.HEAVY_WORKERS))'], { HEAVY_URL: q.url });
    expect(r.code).toBe(8);
  });
  it('serves its icon, logo and manifest, linked from the page, and status reports load1', async () => {
    const q = await serve({ slots: 2, cores: 16 });
    expect(typeof (await q.status()).load1).toBe('number');
    const page = await (await fetch(q.url + '/')).text();
    expect(page).toContain('rel=apple-touch-icon href=/icon.png');
    for (const [p, t] of [['/icon.png', 'image/png'], ['/logo.svg', 'image/svg+xml']]) expect((await fetch(q.url + p)).headers.get('content-type')).toBe(t);
    expect((await (await fetch(q.url + '/manifest.json')).json()).icons[0].src).toBe('/icon.png');
  });
  it('heavy load prints one line', async () => {
    const q = await serve({ slots: 2, cores: 16, scan: () => [{ pid: 9, cmd: 'chrome --headless', cwd: '/x' }], sweepMs: 30, log: join(mkdtempSync(join(tmpdir(), 'hq-load-')), 'b.log'), renice: () => {} });
    await q.post('/acquire', { label: 'a' });
    await q.post('/acquire', { label: 'b' });
    await q.post('/acquire', { label: 'c' });
    await until(async () => (await q.status()).unqueued.length === 1);
    const r = heavy(['load'], { HEAVY_URL: q.url });
    expect((await r).code).toBe(0);
    expect(r.out()).toMatch(/^load \d+\.\d\d \d+\.\d\d \d+\.\d\d \| cores 16 \| slots 2\/2 \| queued 1 \| unqueued 1( \| cache \d+\.\d GB)?\n$/);
  });
  it('flags headless chromium and puppeteer scripts, never a normal browser', () => {
    for (const c of ['/c/chrome --headless --user-data-dir=/tmp/playwright_chromiumdev_profile-x', 'node /g/node_modules/puppeteer/lib/cli.js']) expect(isHeavy(c.split(' ')), c).toBe(true);
    for (const c of ['/c/chrome --remote-debugging-pipe --no-sandbox', '/c/chrome --enable-automation', '/c/chrome --user-data-dir=/home/user/.config/chrome']) expect(isHeavy(c.split(' ')), c).toBe(false);
  });
  it.skipIf(process.platform === 'win32')('procScan: queued headless chromium is held, an outside one is not, a normal Chrome is not listed', () => {
    const root = mkdtempSync(join(tmpdir(), 'hq-proc2-'));
    const mk = (pid, args, env) => {
      mkdirSync(join(root, String(pid)));
      writeFileSync(join(root, String(pid), 'cmdline'), args.join('\0') + '\0');
      writeFileSync(join(root, String(pid), 'stat'), `${pid} (chrome) S 1 0 0`);
      writeFileSync(join(root, String(pid), 'environ'), env.join('\0') + '\0');
    };
    mk(10, ['/c/chrome', '--headless=new', '--user-data-dir=/tmp/playwright_chromiumdev_profile-a'], ['HEAVY_HELD=1']);
    mk(20, ['/c/chrome', '--headless=new', '--user-data-dir=/tmp/puppeteer_dev_profile-b'], ['A=1']);
    mk(30, ['/c/chrome', '--user-data-dir=/home/user/.config/chrome', '--remote-debugging-pipe'], ['A=1']);
    const r = procScan(root).sort((a, b) => a.pid - b.pid).map(({ pid, held }) => ({ pid, held }));
    expect(r).toEqual([{ pid: 10, held: true }, { pid: 20, held: false }]);
  });
  it('HEAVY_WORKERS reaches maxWorkers in vitest.config.ts and the scaffold template; unset leaves it out', async () => {
    const tpl = join(import.meta.dirname, 'tpl-config.tmp.ts');
    writeFileSync(tpl, readFileSync(join(import.meta.dirname, '../../components/scaffold/template/vitest.config.ts.tpl'), 'utf8'));
    const old = process.env.HEAVY_WORKERS;
    try {
      for (const f of ['../../vitest.config.ts', './tpl-config.tmp.ts']) {
        process.env.HEAVY_WORKERS = '3';
        expect((await import(`${f}?on${Math.random()}`)).default.test.maxWorkers, f).toBe(3);
        delete process.env.HEAVY_WORKERS;
        expect('maxWorkers' in (await import(`${f}?off${Math.random()}`)).default.test, f).toBe(false);
      }
    } finally { if (old === undefined) delete process.env.HEAVY_WORKERS; else process.env.HEAVY_WORKERS = old; rmSync(tpl); }
  });
});

describe('heavy --mem and --slots (K474)', () => {
  const posix = process.platform !== 'win32';
  const fake = (body) => {
    const d = mkdtempSync(join(tmpdir(), 'k474-'));
    const f = join(d, 'systemd-run');
    writeFileSync(f, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    return { f, d };
  };
  it.skipIf(!posix)('--mem runs the command inside the capped scope', async () => {
    const { f, d } = fake('case "$*" in *memory.max*) echo 7516192768; echo 0; exit 0;; esac; echo "$@" >> "$0.log"; while [ "$1" != "--" ]; do shift; done; shift; exec "$@"');
    const q = await serve({});
    const r = await heavy(['run', '--mem', '7', '--', process.execPath, '-e', 'process.exit(9)'], { HEAVY_URL: q.url, HEAVY_SYSTEMD_RUN: f });
    expect(r.code).toBe(9);
    const log = readFileSync(f + '.log', 'utf8').split('\n').filter(Boolean);
    expect(log.at(-1)).toContain('--user --scope -q -p MemoryMax=7G -p MemorySwapMax=0 -- ' + process.execPath);
    rmSync(d, { recursive: true });
  });
  it.skipIf(!posix)('--mem refuses to run uncapped when no cap can be set', async () => {
    const { f, d } = fake('exit 1');
    const d2 = mkdtempSync(join(tmpdir(), 'k474-'));
    const mark = join(d2, 'ran');
    const r = await heavy(['run', '--mem', '7', '--', process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(mark)}, 'x')`], { HEAVY_URL: await deadUrl(), HEAVY_SYSTEMD_RUN: f, HEAVY_CAP_RETRIES: '1' });
    expect(r.code).toBe(4);
    expect(r.err).toContain('not running uncapped');
    expect(existsSync(mark)).toBe(false);
    rmSync(d, { recursive: true }); rmSync(d2, { recursive: true });
  });
  it.skipIf(!posix)('--mem retries the cap probe until the user systemd is up (K501)', async () => {
    const { f, d } = fake('c="$0.count"; case "$*" in *memory.max*) n=$(cat "$c" 2>/dev/null || echo 0); echo $((n+1)) > "$c"; [ "$n" -lt 1 ] && exit 1; echo 7516192768; echo 0; exit 0;; esac; while [ "$1" != "--" ]; do shift; done; shift; exec "$@"');
    const r = await heavy(['run', '--mem', '7', '--', process.execPath, '-e', 'process.exit(9)'], { HEAVY_URL: await deadUrl(), HEAVY_SYSTEMD_RUN: f, HEAVY_CAP_WAIT_MS: '10' });
    expect(r.code).toBe(9);
    expect(r.err).toContain('memory cap not ready, retrying in 0.01 s (1/6)');
    rmSync(d, { recursive: true });
  });
  it.skipIf(!posix)('--mem still exits 4 after all the cap retries (K501)', async () => {
    const { f, d } = fake('echo x >> "$0.log"; exit 1');
    const r = await heavy(['run', '--mem', '7', '--', process.execPath, '-e', 'process.exit(0)'], { HEAVY_URL: await deadUrl(), HEAVY_SYSTEMD_RUN: f, HEAVY_CAP_WAIT_MS: '10', HEAVY_CAP_RETRIES: '3' });
    expect(r.code).toBe(4);
    expect(readFileSync(f + '.log', 'utf8').split(String.fromCharCode(10)).filter(Boolean)).toHaveLength(3);
    rmSync(d, { recursive: true });
  });
  it.skipIf(!posix)('--mem refuses when the scope starts but the cgroup shows no cap (max) or a swap allowance', async () => {
    for (const out of ['echo max', 'echo 7516192768; echo max', 'echo 1073741824; echo 0']) {
      const { f, d } = fake(`case "$*" in *memory.max*) ${out}; exit 0;; esac; exit 0`);
      const r = await heavy(['run', '--mem', '7', '--', process.execPath, '-e', 'process.exit(0)'], { HEAVY_URL: await deadUrl(), HEAVY_SYSTEMD_RUN: f, HEAVY_CAP_RETRIES: '1' });
      expect(r.code, out).toBe(4);
      expect(r.err).toContain('not running uncapped');
      rmSync(d, { recursive: true });
    }
  });
  it.skipIf(!posix)('--mem passes a job killed by SIGKILL through as 137', async () => {
    const { f, d } = fake('case "$*" in *memory.max*) echo 7516192768; echo 0; exit 0;; esac; while [ "$1" != "--" ]; do shift; done; shift; exec "$@"');
    const r = await heavy(['run', '--mem', '7', '--', 'sh', '-c', 'kill -9 $$'], { HEAVY_URL: await deadUrl(), HEAVY_SYSTEMD_RUN: f });
    expect(r.code).toBe(137);
    rmSync(d, { recursive: true });
  });
  const realScope = process.platform === 'linux' && spawnSync('systemd-run', ['--user', '--scope', '-q', '-p', 'MemoryMax=100M', '--', 'true'], { stdio: 'ignore' }).status === 0;
  it.skipIf(!realScope)('--mem with the real systemd-run shows the cap in the job and the kernel kills an over-limit job (137)', async () => {
    const q = await serve({});
    const p1 = heavy(['run', '--mem', '1', '--', 'sh', '-c', 'cg=$(sed -n "s/^0:://p" /proc/self/cgroup); cat /sys/fs/cgroup$cg/memory.max; exit 5'], { HEAVY_URL: q.url });
    const r1 = await p1;
    expect(r1.code).toBe(5);
    expect(p1.out()).toContain('1073741824');
    const r2 = await heavy(['run', '--mem', '1', '--', process.execPath, '-e', 'const a = []; for (let i = 0; i < 40; i++) a.push(Buffer.alloc(64 * 2 ** 20, 1)); process.exit(0)'], { HEAVY_URL: q.url });
    expect(r2.code).toBe(137);
  });
  it('--slots all: a high waiter queued behind jumps an earlier normal all-slots waiter, and never preempts a running one', async () => {
    const q = await serve({ slots: 2 });
    const a = await q.post('/acquire', { label: 'a' });
    const big = await q.post('/acquire', { label: 'big', slots: 'all' });
    expect(big.granted).toBe(false);
    const h = await q.post('/acquire', { label: 'h', priority: 'high' });
    expect(h.granted).toBe(true);
    await q.post('/release', { id: h.id });
    await q.post('/release', { id: a.id });
    await until(async () => (await q.status()).running.some((l) => l.label === 'big'));
    const h2 = await q.post('/acquire', { label: 'h2', priority: 'high' });
    expect(h2.granted).toBe(false);
    await q.post('/release', { id: big.id });
    expect((await q.post('/beat', { id: h2.id })).granted).toBe(true);
  });
  it.skipIf(process.platform !== 'linux')('--slots all: every lease is released when the holder process is killed', async () => {
    const q = await serve({ slots: 2 });
    const run = heavy(['run', '--slots', 'all', '--label', 'big', '--', process.execPath, '-e', 'setTimeout(() => {}, 30000)'], { HEAVY_URL: q.url });
    await until(async () => (await q.status()).running.length === 1);
    run.c.kill('SIGKILL');
    await until(async () => (await q.status()).running.length === 0);
    expect((await q.post('/acquire', { label: 'x' })).granted).toBe(true);
    expect((await q.post('/acquire', { label: 'y' })).granted).toBe(true);
  });
  it('--slots all waits for every slot and holds them all', async () => {
    const q = await serve({ slots: 2 });
    const a = await q.post('/acquire', { label: 'a' });
    const run = heavy(['run', '--slots', 'all', '--label', 'big', '--', process.execPath, '-e', 'setTimeout(() => {}, 1500)'], { HEAVY_URL: q.url });
    await until(async () => (await q.status()).waiting.length === 1);
    expect((await q.status()).waiting[0]).toMatchObject({ label: 'big', need: 2 });
    await q.post('/release', { id: a.id });
    await until(async () => (await q.status()).running.some((l) => l.label === 'big'));
    const b = await q.post('/acquire', { label: 'b' });
    expect(b.granted).toBe(false);
    expect((await q.status()).running).toHaveLength(1);
    await run;
    await until(async () => (await q.post('/beat', { id: b.id })).granted);
  });
  it('--slots 2 of 3 leaves one slot free', async () => {
    const q = await serve({ slots: 3 });
    expect((await q.post('/acquire', { label: 'two', slots: 2 })).granted).toBe(true);
    expect((await q.post('/acquire', { label: 'one' })).granted).toBe(true);
    expect((await q.post('/acquire', { label: 'late' })).granted).toBe(false);
  });
});

describe('heavy-queue cache drop (K495)', () => {
  const cache = (gb, runs, o = {}) => { const st = { gb, runs: 0, logs: [] }; return { st, o: { readCache: () => st.gb, runDrop: () => { st.runs++; st.gb = 1; return runs ?? true; }, say: (m) => st.logs.push(m), ...o } }; };
  const job = async (q) => { const a = await q.post('/acquire', { label: 'j' }); await q.post('/release', { id: a.id, exit: 0 }); };
  it('above the limit it drops once and logs before and after', async () => {
    const { st, o } = cache(10);
    const q = await serve({ dropGb: 6, dropEveryMs: 0, ...o });
    await job(q);
    await until(async () => (await q.status()).lastDrop);
    expect(st.runs).toBe(1);
    expect(st.logs).toEqual(['heavy-queue: dropped file cache 10 GB -> 1 GB']);
    expect((await q.status()).cacheGB).toBe(1);
  });
  it('below the limit it does nothing', async () => {
    const { st, o } = cache(3);
    const q = await serve({ dropGb: 6, dropEveryMs: 0, ...o });
    await job(q); await sleep(100);
    expect(st.runs).toBe(0);
    expect((await q.status()).lastDrop).toBe(null);
  });
  it('0 turns it off', async () => {
    const { st, o } = cache(50);
    const q = await serve({ dropGb: 0, dropEveryMs: 0, ...o });
    await job(q); await sleep(100);
    expect(st.runs).toBe(0);
  });
  it('at most one check per HEAVY_DROP_EVERY_MS', async () => {
    const { st, o } = cache(10);
    const q = await serve({ dropGb: 6, dropEveryMs: 3600000, ...o });
    await job(q);
    await until(async () => (await q.status()).lastDrop);
    st.gb = 10;
    await job(q); await job(q); await sleep(100);
    expect(st.runs).toBe(1);
  });
  it('a sudo failure warns once, never throws, never retries', async () => {
    const { st, o } = cache(10, false);
    const q = await serve({ dropGb: 6, dropEveryMs: 0, ...o });
    await job(q); await until(() => st.logs.length);
    await job(q); await job(q); await sleep(100);
    expect(st.runs).toBe(1);
    expect(st.logs).toHaveLength(1);
    expect(st.logs[0]).toMatch(/sudo/);
    expect((await q.status()).lastDrop).toBe(null);
  });
  it('cachedGB parses a real meminfo sample and a missing file is null', () => {
    const d = mkdtempSync(join(tmpdir(), 'mi-'));
    writeFileSync(join(d, 'meminfo'), `MemTotal:       16384000 kB
MemFree:         1000000 kB
Buffers:          100000 kB
Cached:         6291456 kB
SwapCached:            0 kB
`);
    expect(cachedGB(join(d, 'meminfo'))).toBe(6);
    expect(cachedGB(join(d, 'nope'))).toBe(null);
    rmSync(d, { recursive: true });
  });
  it('two drops never overlap', async () => {
    const { st, o } = cache(10);
    let release;
    o.runDrop = () => { st.runs++; return new Promise((r) => (release = () => r(true))); };
    const q = await serve({ dropGb: 6, dropEveryMs: 0, ...o });
    await job(q); await until(() => st.runs === 1);
    await job(q); await job(q); await sleep(100);
    expect(st.runs).toBe(1);
    release();
    await until(async () => (await q.status()).lastDrop);
  });
});
