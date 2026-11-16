// Game server panel: update a game to origin/main and serve it over Tailscale. Node built-ins only.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, rmSync, cpSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmdlineMatches, descendantOf, lockIsHeld, originAllowed, portsMd, SERVE_ROOT, clonePath, gitSteps, killArgs, logPath, mappingPresent, publicUrl, startCommand, tailscaleServeArgs, validatePorts } from './lib.mjs';

const PORTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ports.json');
const STATE = `${SERVE_ROOT}/state.json`;
const TS = 'C:/Program Files/Tailscale/tailscale.exe';
mkdirSync(SERVE_ROOT, { recursive: true });

let cfg;
const loadCfg = () => {
  const c = JSON.parse(readFileSync(PORTS, 'utf8'));
  const errs = validatePorts(c);
  if (errs.length) throw new Error(errs.join('; '));
  cfg = c;
};
const rd = () => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; } };
const S = (id) => rd()[id];
const set = (id, patch) => { const st = rd(); st[id] = { ...st[id], ...patch }; writeFileSync(STATE, JSON.stringify(st, null, 1)); };
const game = (id) => { if (!Object.hasOwn(cfg.games, id)) throw new Error(`unknown game ${id}`); return cfg.games[id]; };

const answers = (port) => new Promise((ok) => {
  const s = connect({ port, host: '127.0.0.1' }, () => { s.destroy(); ok(true); });
  s.on('error', () => ok(false));
  s.setTimeout(1500, () => { s.destroy(); ok(false); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (id, t) => appendFileSync(logPath(id), `\n[${new Date().toISOString()}] ${t}\n`);

// Run a command with output appended to the game's log; shell only for commands that come from ports.json.
const run = (id, cmd, args, { cwd, shell = false, env } = {}) => new Promise((ok, bad) => {
  const fd = openSync(logPath(id), 'a');
  const p = spawn(cmd, args, { cwd, shell, windowsHide: true, stdio: ['ignore', fd, fd], env: { ...process.env, ...env } });
  p.on('error', (e) => { closeSync(fd); bad(e); });
  p.on('close', (code) => { closeSync(fd); if (code === 0) ok(); else bad(new Error(`${cmd} ${args[0] ?? ''} exited ${code}`)); });
});
const out = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true }).stdout?.trim() ?? '';

const killTree = (pid) => { if (pid) spawnSync('taskkill', killArgs(pid), { windowsHide: true }); };
const ps = (script) => spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true }).stdout?.trim() ?? '';
const listenPid = (port) => Number(ps(`(Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`)) || 0;
const procs = () => { try { const j = JSON.parse(ps('Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress')); return Array.isArray(j) ? j : [j]; } catch { return []; } };
const cmdline = (pid) => ps(`(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`);
const lockFile = (id) => `${SERVE_ROOT}/${id}.lock`;
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const lockHeld = (id) => { try { return lockIsHeld(readFileSync(lockFile(id), 'utf8'), pidAlive); } catch { return false; } };
const takeLock = (id) => {
  if (lockHeld(id)) throw new Error('a job is already running for this game');
  rmSync(lockFile(id), { force: true });
  try { writeFileSync(lockFile(id), JSON.stringify({ pid: process.pid, time: Date.now() }), { flag: 'wx' }); } catch { throw new Error('a job is already running for this game'); }
};
const busy = { has: lockHeld };

async function update(id) {
  const g = game(id);
  takeLock(id);
  const root = clonePath(id);
  const dir = g.serve.cwd ? join(root, g.serve.cwd) : root;
  try {
    note(id, 'update started');
    set(id, { status: 'updating', error: null });
    if (!existsSync(join(root, '.git'))) {
      const url = out('git', ['remote', 'get-url', 'origin'], g.repo);
      if (!url) throw new Error('cannot read origin URL of ' + g.repo);
      await run(id, 'git', ['clone', url, root]);
    }
    for (const a of gitSteps()) await run(id, 'git', a, { cwd: root });
    for (const p of g.serve.copyIgnored ?? []) {
      const from = join(g.repo, p);
      if (existsSync(from)) cpSync(from, join(root, p), { recursive: true });
      else note(id, `copyIgnored missing in main clone: ${p}`);
    }
    const commit = out('git', ['log', '-1', '--format=%h|%cI|%s'], root);
    const lock = join(dir, 'package-lock.json');
    const hash = existsSync(lock) ? createHash('sha1').update(readFileSync(lock)).digest('hex') : '';
    if (hash !== S(id)?.lockHash || !existsSync(join(dir, 'node_modules'))) {
      set(id, { status: 'building' });
      await run(id, 'npm', ['ci'], { cwd: dir, shell: true });
      set(id, { lockHash: hash });
    }
    set(id, { status: 'building' });
    await run(id, g.serve.build, [], { cwd: dir, shell: true, env: g.serve.env });
    stopServer(id);
    const foreign = listenPid(g.serve.local);
    if (foreign) { note(id, `port ${g.serve.local} held by pid ${foreign}; killing`); killTree(foreign); for (let i = 0; i < 10 && (await answers(g.serve.local)); i++) await sleep(500); }
    const fd = openSync(logPath(id), 'a');
    const child = spawn(startCommand(g.serve), [], { cwd: dir, shell: true, detached: true, windowsHide: true, stdio: ['ignore', fd, fd], env: { ...process.env, ...g.serve.env } });
    child.unref();
    closeSync(fd);
    set(id, { pid: child.pid });
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { await sleep(1000); up = await answers(g.serve.local); }
    if (!up) throw new Error(`server did not answer on port ${g.serve.local}`);
    const lp = listenPid(g.serve.local);
    if (!lp || !descendantOf(procs(), lp, child.pid)) throw new Error(`port ${g.serve.local} is not served by the new process (listener pid ${lp})`);
    await ensureMapping(g.serve.https, g.serve.local);
    const [hashShort, date, subject] = commit.split('|');
    set(id, { status: 'serving', commit: hashShort, commitDate: date, subject, time: new Date().toISOString() });
    note(id, 'serving');
  } catch (e) {
    note(id, 'FAILED: ' + e.message);
    set(id, { status: 'failed', error: e.message });
    throw e;
  } finally { rmSync(lockFile(id), { force: true }); }
}

function stopServer(id) {
  const pid = S(id)?.pid;
  if (pid && cmdlineMatches(cmdline(pid), startCommand(game(id).serve))) killTree(pid);
  set(id, { pid: null });
}
function stop(id) {
  game(id);
  if (busy.has(id)) throw new Error('a job is running for this game');
  stopServer(id);
  set(id, { status: 'stopped' });
  note(id, 'stopped');
}

async function ensureMapping(https, local) {
  const r = spawnSync(TS, ['serve', 'status', '--json'], { encoding: 'utf8', windowsHide: true });
  let st = {};
  try { st = JSON.parse(r.stdout || '{}'); } catch { /* none */ }
  if (mappingPresent(st, https, local)) return;
  const m = spawnSync(TS, tailscaleServeArgs(https, local), { encoding: 'utf8', windowsHide: true });
  if (m.status !== 0) throw new Error('tailscale serve failed: ' + (m.stderr || m.stdout));
}

const tail = (id, n = 25) => { try { return readFileSync(logPath(id), 'utf8').split('\n').slice(-n).join('\n'); } catch { return ''; } };
async function status() {
  const r = {};
  for (const [id, g] of Object.entries(cfg.games)) {
    const s = S(id) ?? {};
    const up = await answers(g.serve.local);
    let st = s.status ?? 'stopped';
    if (st === 'serving' && !up) st = 'failed';
    if (st === 'failed' && up && !busy.has(id)) st = 'serving';
    if (st === 'stopped' && up) st = 'serving';
    r[id] = { id, name: g.name, url: publicUrl(g.serve.https), status: busy.has(id) && st === 'serving' ? 'updating' : st, commit: s.commit, commitDate: s.commitDate, subject: s.subject, time: s.time, error: s.error, log: tail(id) };
  }
  return r;
}

async function adopt() {
  for (const id of Object.keys(cfg.games)) {
    const s = S(id);
    if (!s) continue;
    if (s.status === 'updating' || s.status === 'building') set(id, { status: 'failed', error: 'panel restarted during the job' });
    else if (s.status === 'serving' && !(await answers(cfg.games[id].serve.local))) set(id, { status: 'stopped', pid: null });
  }
}

const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Game server</title>
<style>body{margin:0;padding:12px;background:#111418;color:#e6e6e6;font:16px system-ui,sans-serif;max-width:640px;margin:auto}
.g{background:#1b2027;border-radius:10px;padding:12px;margin:12px 0}h1{font-size:20px}h2{margin:0 0 4px;font-size:18px}
.s{display:inline-block;padding:2px 8px;border-radius:8px;font-size:13px;background:#333}.serving{background:#1f6b3a}.failed{background:#8a2b2b}.updating,.building{background:#8a6b1f}
button,a.b{display:block;box-sizing:border-box;width:100%;margin:6px 0;padding:14px;font-size:17px;border:0;border-radius:8px;background:#2f5fb3;color:#fff;text-align:center;text-decoration:none}
button.x{background:#555}small{color:#9aa}pre{white-space:pre-wrap;word-break:break-all;font-size:12px;background:#0b0d10;padding:8px;border-radius:6px;max-height:260px;overflow:auto}
.r{display:flex;gap:8px}</style>
<h1>Game server</h1><button class=x onclick="act('/api/reload')">Reload ports.json</button><div id=m></div><div id=l></div>
<script>
const open=new Set();
async function act(u){const r=await fetch(u,{method:'POST'});const j=await r.json();document.getElementById('m').textContent=j.error||'';load()}
async function load(){const s=await (await fetch('/api/status')).json();const e=x=>String(x??'').replace(/[&<>]/g,c=>'&#'+c.charCodeAt(0)+';');
document.getElementById('l').innerHTML=Object.values(s).map(g=>'<div class=g><h2>'+e(g.name)+' <span class="s '+g.status+'">'+g.status+'</span></h2><small>'+e(g.url)+'<br>'+(g.commit?e(g.commit)+' '+e((g.commitDate||'').slice(0,16))+' '+e(g.subject):'no build yet')+'</small>'
+(g.error?'<p>'+e(g.error)+'</p>':'')+'<button onclick="act(\\'/api/update/'+g.id+'\\')">Update &amp; serve</button><div class=r><button class=x onclick="act(\\'/api/stop/'+g.id+'\\')">Stop</button><a class=b href="'+e(g.url)+'" target=_blank>Open</a></div>'
+'<details data-id="'+g.id+'"'+(open.has(g.id)?' open':'')+'><summary>Log</summary><pre>'+e(g.log)+'</pre></details></div>').join('');
document.querySelectorAll('details').forEach(d=>d.ontoggle=()=>d.open?open.add(d.dataset.id):open.delete(d.dataset.id))}
load();setInterval(load,4000);
</script>`;

const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
function panel() {
  createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      if (req.method === 'GET' && u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
      if (req.method === 'GET' && u.pathname === '/api/status') return json(res, 200, await status());
      if (req.method === 'POST') {
        if (!originAllowed(req.headers, cfg)) return json(res, 403, { error: 'forbidden origin' });
        const [, api, act, id] = u.pathname.split('/');
        if (api !== 'api') return json(res, 404, { error: 'not found' });
        if (act === 'reload') { loadCfg(); return json(res, 200, {}); }
        if (act === 'update') { game(id); update(id).catch(() => {}); return json(res, 200, {}); }
        if (act === 'stop') { stop(id); return json(res, 200, {}); }
      }
      json(res, 404, { error: 'not found' });
    } catch (e) { json(res, 400, { error: e.message }); }
  }).listen(cfg.panel.local, '127.0.0.1', () => console.log(`panel on http://127.0.0.1:${cfg.panel.local}`));
}

loadCfg();
const [cmd, id] = process.argv.slice(2);
if (!cmd) { await adopt(); panel(); }
else if (cmd === 'status') console.log(Object.values(await status()).map((g) => `${g.id}\t${g.status}\t${g.commit ?? '-'}\t${g.url}`).join('\n'));
else if (cmd === 'ports-md') writeFileSync(join(dirname(PORTS), 'docs', 'PORTS.md'), portsMd(cfg));
else if (cmd === 'update') { await update(id); console.log('serving'); process.exit(0); }
else if (cmd === 'stop') { stop(id); console.log('stopped'); }
else { console.error('usage: server.mjs [update <id> | stop <id> | status]'); process.exit(2); }
