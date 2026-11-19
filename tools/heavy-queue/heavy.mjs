// heavy run [--priority high|normal] [--label t] -- cmd...  |  hold --pid p [--priority] [--label]  |  release <id> [exit]  |  status   (K399)
import { spawn } from 'node:child_process';
import { availableParallelism, constants, loadavg } from 'node:os';
import { basename } from 'node:path';
import { defaultPort } from './server.mjs';

const URL_ = process.env.HEAVY_URL || `http://127.0.0.1:${defaultPort()}`;
const POLL = Number(process.env.HEAVY_POLL) || 1000;
const BEAT = Number(process.env.HEAVY_BEAT) || 5000;
const GIVEUP = Number(process.env.HEAVY_GIVEUP) || 60000;
const LOCK = process.env.HEAVY_LOCK || '/tmp/heavy-queue.lock';
const SIGS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const say = (m) => process.stderr.write(`[heavy] ${m}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (path, body) => { const r = await fetch(URL_ + path, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }); return { code: r.status, ...(await r.json()) }; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sigCode = (code, sig) => code ?? 128 + (constants.signals[sig] ?? 1);
const listen = (on) => { for (const [s, h] of Object.entries(on)) process.on(s, h); return () => { for (const [s, h] of Object.entries(on)) process.off(s, h); }; };

const loadLine = (s, la = loadavg(), cores = s.cores ?? availableParallelism()) => `load ${la.map((x) => x.toFixed(2)).join(' ')} | cores ${cores} | slots ${s.running.length}/${s.slots} | queued ${s.waiting.length} | unqueued ${s.unqueued.length}`;
function flags(a) {
  const f = { priority: 'normal' };
  let i = 0;
  for (; i < a.length && a[i] !== '--'; i++) if (a[i].startsWith('--')) f[a[i].slice(2)] = a[++i];
  f.cmd = a.slice(i + 1);
  return f;
}

// The command runs in its own process group (not on Windows); a guard kills the group if heavy itself is killed.
function exec(cmd, extra = {}) {
  const group = process.platform !== 'win32';
  return new Promise((resolve) => {
    const c = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', detached: group, env: { ...process.env, HEAVY_HELD: '1', ...extra } });
    const kill = (s) => { try { if (group) process.kill(-c.pid, s); else c.kill(s); } catch { /* gone */ } };
    const off = listen(Object.fromEntries(SIGS.map((s) => [s, () => kill(s)])));
    if (group && c.pid) spawn(process.execPath, [process.argv[1], '_guard', String(process.pid), String(c.pid)], { detached: true, stdio: 'ignore' }).unref();
    c.on('error', (e) => { off(); say(`could not start ${cmd[0]}: ${e.message}`); resolve(127); });
    c.on('exit', (code, sig) => { off(); resolve(sigCode(code, sig)); });
  });
}

// Waits until granted; null when the server never answered or stopped answering for GIVEUP ms.
async function acquire(f, pid, resume = false) {
  let r;
  try { r = await post('/acquire', { label: f.label, priority: f.priority, pid, resume }); } catch { return null; }
  let told = false, failSince = 0;
  const off = listen(Object.fromEntries(SIGS.map((s) => [s, () => { post('/release', { id: r.id }).catch(() => {}).finally(() => process.exit(sigCode(null, s))); }])));
  while (!r.granted) {
    if (!told) { say(`waiting for a slot (${r.ahead} ahead): ${f.label}`); told = true; }
    await sleep(POLL);
    try { r = { ...r, ...(await post('/beat', { id: r.id })) }; failSince = 0; } catch {
      failSince ||= Date.now();
      if (Date.now() - failSince > GIVEUP) { off(); say('queue stopped answering'); return null; }
      continue;
    }
    if (r.code === 404) { off(); say('lease lost (queue restarted): queueing again'); return acquire(f, pid); }
  }
  off();
  f.workers = r.workers;
  return r.id;
}

// No server: hold the lock file with flock (through WSL on Windows) while the command runs; neither: run directly.
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

// Heartbeats a granted lease; a 404 (queue restarted) takes a running lease again at once.
function beat(f, pid, lease) {
  let busy = false;
  const t = setInterval(async () => {
    if (busy) return;
    busy = true;
    const r = await post('/beat', { id: lease.id }).catch(() => ({}));
    if (r.code === 410) lease.gone = true;
    if (r.code === 404) lease.id = (await post('/acquire', { label: f.label, priority: f.priority, pid, resume: true }).catch(() => ({}))).id ?? lease.id;
    busy = false;
  }, BEAT);
  return () => clearInterval(t);
}

async function run(f) {
  if (!f.cmd.length) { say('usage: heavy run [--priority high|normal] [--label <text>] -- <cmd...>'); return 2; }
  if (process.env.HEAVY_HELD === '1') return exec(f.cmd);
  f.label ??= `${basename(process.cwd())}: ${f.cmd.join(' ')}`.slice(0, 120);
  const pid = process.platform === 'linux' ? process.pid : 0;
  const id = await acquire(f, pid);
  if (!id) return fallback(f.cmd);
  const lease = { id };
  const stop = beat(f, pid, lease);
  const code = await exec(f.cmd, { HEAVY_LEASE: id, ...(f.workers ? { HEAVY_WORKERS: String(f.workers) } : {}) });
  stop();
  await post('/release', { id: lease.id, exit: code }).catch(() => {});
  return code;
}

async function main([cmd, ...a]) {
  if (cmd === 'run') return run(flags(a));
  if (cmd === 'hold') {
    const f = flags(a);
    const id = await acquire(f, Number(f.pid));
    if (!id) { say('queue unreachable: not holding a slot'); return 3; }
    spawn(process.execPath, [process.argv[1], '_watch', id, f.pid, f.label ?? '', f.priority], { detached: true, stdio: 'ignore' }).unref();
    console.log(id);
    return 0;
  }
  if (cmd === '_watch') {
    const pid = Number(a[1]), lease = { id: a[0] };
    const stop = beat({ label: a[2], priority: a[3] }, pid, lease);
    while (alive(pid) && !lease.gone) await sleep(Math.min(BEAT, 1000));
    stop();
    await post('/release', { id: lease.id }).catch(() => {});
    return 0;
  }
  if (cmd === '_guard') {
    const [parent, pgid] = a.map(Number);
    while (alive(parent)) { await sleep(1000); try { process.kill(-pgid, 0); } catch { return 0; } }
    try { process.kill(-pgid, 'SIGTERM'); } catch { /* gone */ }
    return 0;
  }
  if (cmd === 'workers') { try { console.log((await (await fetch(URL_ + '/status')).json()).workers ?? ''); return 0; } catch { return 3; } }
  if (cmd === 'load') { try { console.log(loadLine(await (await fetch(URL_ + '/status')).json())); return 0; } catch { say(`no queue at ${URL_}`); return 3; } }
  if (cmd === 'release') { await post('/release', { id: a[0], exit: a[1] === undefined ? null : Number(a[1]) }).catch(() => {}); return 0; }
  if (cmd === 'status') { try { console.log(JSON.stringify(await (await fetch(URL_ + '/status')).json(), null, 2)); return 0; } catch { say(`no queue at ${URL_}`); return 3; } }
  say('usage: heavy run [--priority high|normal] [--label <text>] -- <cmd...> | heavy status | heavy load | heavy hold --pid <pid> [--priority] [--label] | heavy release <id> [exit]');
  return cmd === '--help' || cmd === '-h' ? 0 : 2;
}

process.exitCode = await main(process.argv.slice(2));
