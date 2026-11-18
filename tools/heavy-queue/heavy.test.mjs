import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const HEAVY = fileURLToPath(new URL('./heavy.mjs', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const servers = [];
afterEach(() => { for (const s of servers.splice(0)) s.close(); });
async function serve(o) {
  const s = startServer({ port: 0, tick: 50, ...o });
  servers.push(s);
  await once(s, 'listening');
  const url = `http://127.0.0.1:${s.address().port}`;
  const post = async (p, b) => (await fetch(url + p, { method: 'POST', body: JSON.stringify(b) })).json();
  const status = async () => (await fetch(url + '/status')).json();
  return { url, post, status };
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
  let err = '';
  c.stderr.on('data', (d) => (err += d));
  return new Promise((r) => c.on('exit', (code) => r({ code, err })));
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
  it('frees a lease whose heartbeats stop', async () => {
    const q = await serve({ ttl: 200 });
    const a = await q.post('/acquire', { label: 'a' });
    const b = await q.post('/acquire', { label: 'b' });
    expect(b.granted).toBe(false);
    for (let i = 0; i < 8; i++) { await sleep(60); await q.post('/beat', { id: b.id }); }
    expect((await q.post('/beat', { id: b.id })).granted).toBe(true);
    expect((await q.post('/beat', { id: a.id })).error).toBe('unknown lease');
    expect((await q.status()).history[0]).toMatchObject({ label: 'a', reason: 'no heartbeat' });
  });
  it('frees a lease whose watched pid dies', async () => {
    const q = await serve({});
    const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)']);
    await q.post('/acquire', { label: 'job', pid: c.pid });
    expect((await q.status()).running).toHaveLength(1);
    c.kill();
    await once(c, 'exit');
    await sleep(200);
    expect((await q.status()).running).toHaveLength(0);
    expect((await q.status()).history[0]).toMatchObject({ label: 'job', reason: 'pid gone' });
  });
});

describe('heavy run (K399)', () => {
  it('waits for its slot, passes the exit code through and records it', async () => {
    const q = await serve({});
    const hold = await q.post('/acquire', { label: 'other' });
    const run = heavy(['run', '--label', 'mine', '--', process.execPath, '-e', 'process.exit(process.env.HEAVY_HELD === "1" ? 5 : 1)'], { HEAVY_URL: q.url });
    await sleep(300);
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
    const holder = spawn('flock', [lock, 'sleep', '1']);
    await sleep(200);
    const t = Date.now();
    const r = await heavy(['run', '--', process.execPath, '-e', 'process.exit(3)'], { HEAVY_URL: await deadUrl(), HEAVY_LOCK: lock });
    expect(r.code).toBe(3);
    expect(r.err).toContain(`holding ${lock}`);
    expect(Date.now() - t).toBeGreaterThan(500);
    holder.kill();
  });
});
