// heavy run [--priority high|normal] [--label t] -- cmd...  |  hold --pid p [--priority] [--label]  |  release <id> [exit]  |  status   (K399)
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { basename } from 'node:path';
import { defaultPort } from './server.mjs';

const URL_ = process.env.HEAVY_URL || `http://127.0.0.1:${defaultPort()}`;
const POLL = Number(process.env.HEAVY_POLL) || 1000;
const BEAT = Number(process.env.HEAVY_BEAT) || 5000;
const LOCK = process.env.HEAVY_LOCK || '/tmp/heavy-queue.lock';
const say = (m) => process.stderr.write(`[heavy] ${m}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) => { const r = await fetch(URL_ + path, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }); return { code: r.status, ...(await r.json()) }; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sigCode = (code, sig) => code ?? 128 + (constants.signals[sig] ?? 1);

function flags(a) {
  const f = { priority: 'normal' };
  let i = 0;
  for (; i < a.length && a[i] !== '--'; i++) if (a[i].startsWith('--')) f[a[i].slice(2)] = a[++i];
  f.cmd = a.slice(i + 1);
  return f;
}

function exec(cmd, extra = {}) {
  return new Promise((resolve) => {
    const c = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', env: { ...process.env, HEAVY_HELD: '1', ...extra } });
    const fwd = (s) => () => { try { c.kill(s); } catch { /* gone */ } };
    const on = { SIGINT: fwd('SIGINT'), SIGTERM: fwd('SIGTERM') };
    for (const [s, h] of Object.entries(on)) process.on(s, h);
    c.on('error', (e) => { say(`could not start ${cmd[0]}: ${e.message}`); resolve(127); });
    c.on('exit', (code, sig) => { for (const [s, h] of Object.entries(on)) process.off(s, h); resolve(sigCode(code, sig)); });
  });
}

async function acquire(f, pid) {
  let r;
  try { r = await post('/acquire', { label: f.label, priority: f.priority, pid }); } catch { return null; }
  let told = false;
  const cancel = (s) => () => { post('/release', { id: r.id }).catch(() => {}).finally(() => process.exit(sigCode(null, s))); };
  const on = { SIGINT: cancel('SIGINT'), SIGTERM: cancel('SIGTERM') };
  for (const [s, h] of Object.entries(on)) process.on(s, h);
  while (!r.granted) {
    if (!told) { say(`waiting for a slot (${r.ahead} ahead): ${f.label}`); told = true; }
    await sleep(POLL);
    try { r = { ...r, ...(await post('/beat', { id: r.id })) }; } catch { /* server blip: keep polling */ }
    if (r.code === 404) { for (const [s, h] of Object.entries(on)) process.off(s, h); return acquire(f, pid); }
  }
  for (const [s, h] of Object.entries(on)) process.off(s, h);
  return r.id;
}

// No server: hold /tmp/heavy-queue.lock with flock (through WSL on Windows) while the command runs; neither: run directly.
async function fallback(cmd) {
  const fl = process.platform === 'win32' ? ['wsl', '-e', 'flock'] : ['flock'];
  const h = spawn(fl[0], [...fl.slice(1), LOCK, 'sh', '-c', 'echo locked; cat >/dev/null'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const got = await new Promise((r) => { h.on('error', () => r(false)); h.on('exit', () => r(false)); h.stdout.on('data', () => r(true)); });
  if (!got) say('queue unreachable and no flock: running without a slot');
  else say(`queue unreachable: holding ${LOCK}`);
  const code = await exec(cmd);
  if (got) h.stdin.end();
  return code;
}

async function run(f) {
  if (!f.cmd.length) { say('usage: heavy run [--priority high|normal] [--label <text>] -- <cmd...>'); return 2; }
  if (process.env.HEAVY_HELD === '1') return exec(f.cmd);
  f.label ??= `${basename(process.cwd())}: ${f.cmd.join(' ')}`.slice(0, 120);
  const id = await acquire(f, process.platform === 'linux' ? process.pid : 0);
  if (!id) return fallback(f.cmd);
  const t = setInterval(() => post('/beat', { id }).catch(() => {}), BEAT);
  const code = await exec(f.cmd, { HEAVY_LEASE: id });
  clearInterval(t);
  await post('/release', { id, exit: code }).catch(() => {});
  return code;
}

async function watch(id, pid) {
  for (;;) {
    if (!alive(pid)) { await post('/release', { id }).catch(() => {}); return 0; }
    const r = await post('/beat', { id }).catch(() => ({}));
    if (r.code === 404) return 0;
    await sleep(BEAT);
  }
}

async function main([cmd, ...a]) {
  if (cmd === 'run') return run(flags(a));
  if (cmd === 'hold') {
    const f = flags(a);
    const id = await acquire(f, Number(f.pid));
    if (!id) { say('queue unreachable: not holding a slot'); return 3; }
    spawn(process.execPath, [process.argv[1], '_watch', id, f.pid], { detached: true, stdio: 'ignore' }).unref();
    console.log(id);
    return 0;
  }
  if (cmd === '_watch') return watch(a[0], Number(a[1]));
  if (cmd === 'release') { await post('/release', { id: a[0], exit: a[1] === undefined ? null : Number(a[1]) }).catch(() => {}); return 0; }
  if (cmd === 'status') { try { console.log(JSON.stringify(await (await fetch(URL_ + '/status')).json(), null, 2)); return 0; } catch { say(`no queue at ${URL_}`); return 3; } }
  say('usage: heavy run [--priority high|normal] [--label <text>] -- <cmd...> | heavy status | heavy hold --pid <pid> [--priority] [--label] | heavy release <id> [exit]');
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
