// Machine-wide queue for heavy runs (K399): N slots, high before normal, FIFO within; leases end on release, missed heartbeats or a dead pid.
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PORTS = [new URL('./ports.json', import.meta.url), new URL('../../ports.json', import.meta.url)];
export const defaultPort = () => Number(process.env.HEAVY_PORT) || JSON.parse(readFileSync(PORTS.find((u) => existsSync(u)), 'utf8')).tools['heavy-queue'];
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const dur = (ms) => ms == null ? '' : `${Math.round(ms / 1000)} s`;

export function startServer({ port = defaultPort(), slots = Number(process.env.HEAVY_SLOTS) || 1, ttl = Number(process.env.HEAVY_TTL) || 30000, tick = 1000, age = Number(process.env.HEAVY_AGE_MS) || 600000 } = {}) {
  const hi = (x) => x.priority === 'high' || Date.now() - x.queuedAt >= age;
  const leases = new Map();
  const history = [];
  let seq = 0;
  const end = (l, exit, reason) => {
    leases.delete(l.id);
    history.unshift({ id: l.id, label: l.label, priority: l.priority, queuedAt: l.queuedAt, startedAt: l.startedAt, endedAt: Date.now(), exit, reason });
    history.length = Math.min(history.length, 100);
  };
  const step = () => {
    const now = Date.now();
    for (const l of [...leases.values()]) {
      if (performance.now() - l.lastBeat > ttl) end(l, null, 'no heartbeat');
      else if (l.pid && !alive(l.pid)) end(l, null, 'pid gone');
    }
    const all = [...leases.values()];
    let free = slots - all.filter((l) => l.startedAt).length;
    for (const l of all.filter((x) => !x.startedAt).sort((a, b) => (hi(a) ? 0 : 1) - (hi(b) ? 0 : 1) || a.seq - b.seq)) {
      if (free-- <= 0) break;
      l.startedAt = now;
    }
  };
  const view = (l) => {
    const ahead = l.startedAt ? 0 : [...leases.values()].filter((x) => !x.startedAt && (hi(x) && !hi(l) || (hi(x) === hi(l) && x.seq < l.seq))).length;
    return { id: l.id, granted: !!l.startedAt, ahead };
  };
  const status = () => {
    const now = Date.now();
    const ls = [...leases.values()].map((l) => ({ id: l.id, label: l.label, priority: l.priority, pid: l.pid, queuedAt: l.queuedAt, startedAt: l.startedAt, waitedMs: (l.startedAt ?? now) - l.queuedAt, runningMs: l.startedAt ? now - l.startedAt : null }));
    return { slots, running: ls.filter((l) => l.startedAt), waiting: ls.filter((l) => !l.startedAt), history };
  };
  const page = () => {
    const s = status();
    const row = (cells) => `<tr>${cells.map((c) => `<td>${esc(c ?? '')}</td>`).join('')}</tr>`;
    const t = (h, rows) => `<table border=1 cellpadding=4><tr>${h.map((x) => `<th>${x}</th>`).join('')}</tr>${rows.join('')}</table>`;
    const when = (ms) => ms ? new Date(ms).toLocaleTimeString() : '';
    return `<!doctype html><meta charset=utf-8><meta http-equiv=refresh content=5><title>heavy-queue</title><body style="font-family:sans-serif">
<h2>Running (${s.running.length}/${s.slots})</h2>${t(['Label', 'Priority', 'Started', 'Running', 'Waited'], s.running.map((l) => row([l.label, l.priority, when(l.startedAt), dur(l.runningMs), dur(l.waitedMs)])))}
<h2>Waiting (${s.waiting.length})</h2>${t(['Label', 'Priority', 'Queued', 'Waiting'], s.waiting.map((l) => row([l.label, l.priority, when(l.queuedAt), dur(l.waitedMs)])))}
<h2>Recent</h2>${t(['Label', 'Priority', 'Ended', 'Waited', 'Ran', 'Exit'], s.history.map((h) => row([h.label, h.priority, when(h.endedAt), dur((h.startedAt ?? h.endedAt) - h.queuedAt), h.startedAt ? dur(h.endedAt - h.startedAt) : 'never ran', h.exit ?? h.reason])))}`;
  };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      let b;
      try { b = body ? JSON.parse(body) : {}; } catch { return send(400, { error: 'bad json' }); }
      const path = req.url.split('?')[0];
      if (req.method === 'GET' && path === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page()); }
      if (req.method === 'GET' && path === '/status') return send(200, status());
      if (req.method !== 'POST') return send(404, { error: 'not found' });
      if (path === '/acquire') {
        const l = { id: `${Date.now().toString(36)}-${++seq}`, seq, label: String(b.label ?? 'heavy'), priority: b.priority === 'high' ? 'high' : 'normal', pid: Number(b.pid) || 0, queuedAt: Date.now(), lastBeat: performance.now() };
        if (b.resume) l.startedAt = Date.now();
        leases.set(l.id, l);
        step();
        return send(200, view(l));
      }
      const l = leases.get(b.id);
      if (!l) return history.some((h) => h.id === b.id) ? send(410, { error: 'lease ended' }) : send(404, { error: 'unknown lease' });
      if (path === '/beat') { l.lastBeat = performance.now(); step(); return send(200, view(l)); }
      if (path === '/release') { end(l, b.exit ?? null, l.startedAt ? 'released' : 'cancelled'); step(); return send(200, { ok: true }); }
      send(404, { error: 'not found' });
    });
  });
  const timer = setInterval(step, tick);
  server.on('close', () => clearInterval(timer));
  server.listen(port, '127.0.0.1');
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = startServer();
  s.on('listening', () => console.log(`heavy-queue on http://127.0.0.1:${s.address().port}`));
}
