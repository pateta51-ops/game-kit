// Game server panel: update a game to origin/main and serve it over Tailscale. Node built-ins only.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, appendFileSync, rmSync, cpSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmdlineMatches, descendantOf, lockIsHeld, originAllowed, portsMd, SERVE_ROOT, clonePath, gitSteps, killArgs, logPath, mappingPresent, nextSlot, addGameText, publicUrl, startCommand, tailscaleServeArgs, validatePorts } from './lib.mjs';

const PORTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ports.json');
const BOXES = JSON.parse(readFileSync(new URL('./boxes.json', import.meta.url), 'utf8'));
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

const PAGE = `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Game server</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#101315;color:#eceee9;font:15px system-ui,sans-serif}main{max-width:1240px;margin:auto;padding:36px 24px 60px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:28px}.eyebrow{color:#b9c99c;font-size:11px;letter-spacing:.18em;text-transform:uppercase}h1{font-size:32px;letter-spacing:-.04em;margin:6px 0}header p{color:#8e9997;margin:0;font-size:13px}#l{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.g{min-width:0;background:#1a2022;border:1px solid #30383a;border-radius:16px;overflow:hidden;display:flex;flex-direction:column}.art{position:relative;display:flex;align-items:center;justify-content:center;height:340px;padding:24px;overflow:hidden;background:radial-gradient(ellipse at 50% 20%,hsl(var(--h) 22% 25%),#111718);color:#f2eee0;text-decoration:none;border-bottom:1px solid #30383a}.art img{position:relative;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 12px 12px #0008)}.fallback{position:absolute;inset:24px;display:flex;flex-direction:column;justify-content:space-between;padding:24px;border:1px solid #ffffff28;background:repeating-linear-gradient(135deg,transparent,transparent 28px,#ffffff06 29px,#ffffff06 30px),linear-gradient(150deg,hsl(var(--h) 32% 29%),hsl(var(--h) 25% 12%))}.fallback small{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#d4dbc8}.fallback strong{font-family:Georgia,serif;font-weight:400;font-size:38px;line-height:1.08;max-width:240px;overflow-wrap:anywhere}.art:has(img) .fallback{display:none}.body{padding:20px;display:flex;flex-direction:column;flex:1}h2{font-size:20px;line-height:1.25;letter-spacing:-.025em;margin:12px 0 8px}.s{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid #4b5558;border-radius:20px;font-size:11px;text-transform:capitalize;color:#bbc4c5;background:#ffffff05}.s:before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor}.serving{color:#b5df9c;border-color:#526948;background:#a5cf7b0b}.failed{color:#ffb1a5;border-color:#88564d}.updating,.building{color:#ecd08b;border-color:#7e704b}.commit{color:#a0aaa8;font-size:12px;line-height:1.6;min-height:39px;overflow-wrap:anywhere}.url{color:#798583;font-size:11px;overflow-wrap:anywhere;margin-top:6px}.error{color:#ffb1a5;font-size:13px;overflow-wrap:anywhere}.error:empty{display:none}.actions{margin-top:auto;padding-top:18px}button,a.b{display:flex;align-items:center;justify-content:center;min-height:44px;padding:11px 14px;border:1px solid transparent;border-radius:8px;background:#c6d9a7;color:#1b2718;font:600 13px system-ui,sans-serif;text-decoration:none;cursor:pointer;width:100%}button:hover,a.b:hover{filter:brightness(1.1)}button.x{background:transparent;color:#b9c2bf;border-color:#414c4c}header button.x{width:auto;white-space:nowrap;font-size:12px}.r{display:flex;gap:8px;margin-top:8px}.r a{background:#303c36;color:#d3dfcc;border-color:#4a594d}.r>*{flex:1}details{margin-top:16px;border-top:1px solid #313b3b;padding-top:12px}summary{cursor:pointer;color:#929f99;font-size:12px;min-height:28px}pre{white-space:pre-wrap;word-break:break-all;font-size:12px;background:#111718;padding:12px;border-radius:6px;max-height:260px;overflow:auto}#m{color:#ffb1a5;margin-bottom:16px}#m:empty{display:none}:focus-visible{outline:2px solid #d9edb9;outline-offset:3px}
@media(max-width:1000px){#l{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){main{padding:24px 16px 40px}header{align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:24px}h1{font-size:30px}header button.x{min-height:40px}#l{grid-template-columns:1fr;gap:24px}.art{height:330px}.body{padding:20px}}
</style>
<main><header><div><div class=eyebrow>Private collection</div><h1>Game server</h1><p>Your prototypes, ready to play.</p></div><button class=x onclick="act('/api/reload')">Reload ports.json</button></header><div id=m role=status></div><div id=l></div></main>
<script>
const cards=new Map(),covers=${JSON.stringify(Object.keys(BOXES))};
async function act(u){try{const r=await fetch(u,{method:'POST'});const j=await r.json();document.getElementById('m').textContent=j.error||'';await load()}catch(e){document.getElementById('m').textContent=e.message}}
async function load(){try{const s=await (await fetch('/api/status')).json();
for(const [id,c] of cards)if(!s[id]){c.remove();cards.delete(id)}
for(const g of Object.values(s)){
let c=cards.get(g.id);
if(!c){c=document.createElement('article');c.className='g';c.style.setProperty('--h',Array.from(g.id).reduce((h,c)=>h*31+c.charCodeAt(0),0)>>>0);
c.innerHTML='<a class=art target=_blank rel=noopener><span class=fallback><small>Private prototype</small><strong></strong><small>Board game collection</small></span></a><div class=body><span class=s></span><h2></h2><div class=commit></div><div class=url></div><p class=error></p><div class=actions><button class=update>Update &amp; serve</button><div class=r><button class=x>Stop</button><a class=b target=_blank rel=noopener>Open ↗</a></div></div><details><summary>Log</summary><pre></pre></details></div>';
c.querySelector('.fallback strong').textContent=g.name;
if(covers.includes(g.id)){const img=document.createElement('img');img.alt=g.name+' box';img.src='/box/'+encodeURIComponent(g.id);img.onerror=()=>img.remove();c.querySelector('.art').append(img)}
c.querySelector('.update').onclick=()=>act('/api/update/'+encodeURIComponent(g.id));c.querySelector('.r button').onclick=()=>act('/api/stop/'+encodeURIComponent(g.id));cards.set(g.id,c);document.getElementById('l').append(c)}
c.querySelector('h2').textContent=g.name;c.querySelector('.art').setAttribute('aria-label','Open '+g.name);for(const a of c.querySelectorAll('a'))a.href=g.url;
const pill=c.querySelector('.s');pill.className='s '+g.status;pill.textContent=g.status;
c.querySelector('.commit').textContent=g.commit?g.commit+' · '+(g.commitDate||'').slice(0,16).replace('T',' ')+' · '+(g.subject||''):'No build yet';
c.querySelector('.url').textContent=g.url;c.querySelector('.error').textContent=g.error||'';const log=c.querySelector('pre');if(log.textContent!==(g.log||''))log.textContent=g.log||'';
}}catch(e){document.getElementById('m').textContent=e.message}}
load();setInterval(load,4000);
</script></html>`;

const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
function panel() {
  createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      if (req.method === 'GET' && u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
      if (req.method === 'GET' && u.pathname.startsWith('/box/')) {
        const id = u.pathname.slice(5);
        if (!Object.hasOwn(BOXES, id)) return json(res, 404, { error: 'not found' });
        const file = createReadStream(BOXES[id]);
        file.on('error', () => { if (!res.headersSent) json(res, 404, { error: 'not found' }); else res.destroy(); });
        file.on('open', () => { res.writeHead(200, { 'content-type': { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[extname(BOXES[id]).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'max-age=3600' }); file.pipe(res); });
        res.on('close', () => file.destroy());
        return;
      }
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
else if (cmd === 'add') {
  const [, , , , name, repo, cwd = ''] = process.argv;
  if (!id || !name || !repo) { console.error('usage: server.mjs add <id> "<Name>" <repo path> [app subfolder]'); process.exit(2); }
  if (!existsSync(join(repo, cwd, 'package.json'))) { console.error(`no package.json in ${join(repo, cwd)}`); process.exit(1); }
  const s = nextSlot(cfg);
  const g = { name, repo: repo.replaceAll('\\', '/'), block: s.block, serve: { local: s.local, https: s.https, ...(cwd ? { cwd } : {}), build: 'npm run build', start: 'npx vite preview --host 127.0.0.1 --port {port} --strictPort', copyIgnored: [], env: {} } };
  writeFileSync(PORTS, addGameText(readFileSync(PORTS, 'utf8'), id, g));
  loadCfg();
  writeFileSync(join(dirname(PORTS), 'docs', 'PORTS.md'), portsMd(cfg));
  console.log(`${id}: dev ${s.block}, preview ${s.block + 1}, e2e ${s.block + 2}; phone ${publicUrl(s.https)} (local ${s.local}).
Next: commit ports.json + docs/PORTS.md in game-kit, set the game's vite ports (server ${s.block}, preview ${s.block + 1}, preview.allowedHosts ['.ts.net']), then Reload ports.json in the panel.`);
  try { await fetch(`http://127.0.0.1:${cfg.panel.local}/api/reload`, { method: 'POST' }); } catch { /* panel not running */ }
}
else { console.error('usage: server.mjs [update <id> | stop <id> | status | ports-md | add <id> "<Name>" <repo> [app subfolder]]'); process.exit(2); }
