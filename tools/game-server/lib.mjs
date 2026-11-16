// Pure helpers: ports.json validation and command building (no processes).
export const safeRel = (p) => typeof p === 'string' && p !== '' && !/^[\\/]/.test(p) && !p.includes(':') && !p.split(/[\\/]/).includes('..');
export function validatePorts(cfg) {
  const errs = [];
  const used = new Map();
  const take = (n, what) => {
    if (!Number.isInteger(n) || n < 1 || n > 65535) return errs.push(`${what}: bad port ${n}`);
    if (used.has(n)) errs.push(`${what}: port ${n} already used by ${used.get(n)}`);
    else used.set(n, what);
  };
  if (!cfg || typeof cfg !== 'object' || !cfg.panel || !cfg.games) return ['ports.json: panel and games required'];
  const phone = (n, what) => { if (n < 4170 || n > 4199) errs.push(`${what}: ${n} must be in 4170-4199`); };
  take(cfg.panel.local, 'panel.local');
  phone(cfg.panel.local, 'panel.local');
  const https = new Map([[cfg.panel.https, 'panel.https']]);
  if (!Number.isInteger(cfg.panel.https)) errs.push('panel.https: bad port');
  const blocks = [];
  for (const [id, g] of Object.entries(cfg.games)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errs.push(`${id}: id must be lowercase letters, digits, dashes`);
    if (!g.name || !g.repo || !g.serve) { errs.push(`${id}: name, repo, serve required`); continue; }
    if (!Number.isInteger(g.block)) { errs.push(`${id}: block required`); continue; }
    blocks.push([id, g.block]);
    if (g.block < 1024 || g.block % 10 !== 0 || (g.block + 9 >= 4170 && g.block <= 4199) || (g.block + 9 >= 5190 && g.block <= 5299)) errs.push(`${id}: block ${g.block} must be a multiple of 10 outside 4170-4199 and 5190-5299`);
    for (let i = 0; i < 10; i++) take(g.block + i, `${id}.block+${i}`);
  }
  for (const [id, g] of Object.entries(cfg.games)) {
    const s = g.serve;
    if (!s) continue;
    if (!s.start || !s.start.includes('{port}')) errs.push(`${id}: serve.start must contain {port}`);
    if (!s.build) errs.push(`${id}: serve.build required`);
    if (!Array.isArray(s.copyIgnored ?? [])) errs.push(`${id}: copyIgnored must be an array`);
    for (const p of [...(Array.isArray(s.copyIgnored) ? s.copyIgnored : []), ...(s.cwd === undefined ? [] : [s.cwd])]) if (!safeRel(p)) errs.push(`${id}: path ${JSON.stringify(p)} must be relative, no drive letter, no ..`);
    for (const [bid, b] of blocks) if (s.local >= b && s.local < b + 10) errs.push(`${id}: serve.local ${s.local} inside block of ${bid}`);
    take(s.local, `${id}.serve.local`);
    phone(s.local, `${id}.serve.local`);
    if (!Number.isInteger(s.https)) errs.push(`${id}: serve.https bad`);
    else if (https.has(s.https)) errs.push(`${id}: https ${s.https} already used by ${https.get(s.https)}`);
    else https.set(s.https, id);
  }
  return errs;
}

export const HOST = 'REDACTED';
export const SERVE_ROOT = 'REDACTED';
export const publicUrl = (https) => `https://${HOST}${https === 443 ? '' : ':' + https}`;
export const startCommand = (s) => s.start.replaceAll('{port}', String(s.local));
export const tailscaleServeArgs = (https, local) => ['serve', '--bg', `--https=${https}`, `http://127.0.0.1:${local}`];
export const gitSteps = () => [['fetch', 'origin', 'main'], ['reset', '--hard', 'origin/main'], ['clean', '-fdx', '-e', 'node_modules']];
export const killArgs = (pid) => ['/PID', String(Number(pid)), '/T', '/F'];
export const clonePath = (id) => `${SERVE_ROOT}/${id}`;
export const logPath = (id) => `${SERVE_ROOT}/${id}.log`;
export const mappingPresent = (status, https, local) => Object.entries(status?.Web ?? {}).some(([k, v]) => k.endsWith(`:${https}`) && v?.Handlers?.['/']?.Proxy === `http://127.0.0.1:${local}`);
export const lockIsHeld = (text, alive) => { try { const { pid } = JSON.parse(text); return Number.isInteger(pid) && alive(pid); } catch { return false; } };
export const cmdlineMatches = (cmdline, start) => typeof cmdline === 'string' && cmdline.includes(start);
export const descendantOf = (procs, pid, root) => {
  const parent = new Map(procs.map((p) => [p.ProcessId, p.ParentProcessId]));
  for (let i = 0, p = pid; i < 64 && p; i++, p = parent.get(p)) if (p === root) return true;
  return false;
};
export const allowedHosts = (cfg) => new Set([`127.0.0.1:${cfg.panel.local}`, cfg.panel.https === 443 ? HOST : `${HOST}:${cfg.panel.https}`]);
export const originAllowed = (h, cfg) => {
  const ok = allowedHosts(cfg);
  if (!ok.has(h.host)) return false;
  if (h.origin === undefined) return true;
  try { return ok.has(new URL(h.origin).host); } catch { return false; }
};

export function portsMd(cfg) {
  const rows = Object.values(cfg.games).map((g) => `| ${g.name} | ${g.block} | ${g.block + 1} | ${g.block + 2} | ${g.block + 3} | ${g.serve.local} | ${publicUrl(g.serve.https)} |`);
  return `# Ports

${cfg.about}

Before using a port, look here; a new port = the game's block or an entry in \`ports.json\`, in the same PR.

Generated from \`ports.json\` by \`node tools/game-server/server.mjs ports-md\`; a test fails when this file drifts.

Panel: local ${cfg.panel.local}, ${publicUrl(cfg.panel.https)}

| Game | dev | preview | e2e | e2eAux | phone local | phone URL |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
}
export function nextSlot(cfg) {
  const gs = Object.values(cfg.games);
  let block = Math.max(6000, ...gs.map((g) => g.block)) + 10;
  while ((block + 9 >= 4170 && block <= 4199) || (block + 9 >= 5190 && block <= 5299)) block += 10;
  const locals = new Set([cfg.panel.local, ...gs.map((g) => g.serve.local)]);
  const https = new Set([cfg.panel.https, ...gs.map((g) => g.serve.https)]);
  let local = 4171; while (locals.has(local)) local++;
  let h = 8441; while (https.has(h)) h++;
  if (local > 4199) throw new Error('no free serve port left in 4170-4199');
  return { block, local, https: h };
}
export function addGameText(text, id, g) {
  const cfg = JSON.parse(text);
  if (cfg.games[id]) throw new Error(`${id} is already in ports.json`);
  const end = text.lastIndexOf('\n  }\n}');
  if (end < 0) throw new Error('ports.json layout not recognised');
  const out = text.slice(0, end) + `,\n    ${JSON.stringify(id)}: ${JSON.stringify(g).replaceAll('":', '": ').replaceAll(',"', ', "')}` + text.slice(end);
  const errs = validatePorts(JSON.parse(out));
  if (errs.length) throw new Error(errs.join('\n'));
  return out;
}
