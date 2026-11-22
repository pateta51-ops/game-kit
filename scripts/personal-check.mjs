// Fails when a tracked file or a commit on this branch carries the owner's personal details (the repo is public).
// Extra private words (names, hosts) go in the untracked kit.local.json as "private": ["..."].
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const own = existsSync('kit.local.json') ? JSON.parse(readFileSync('kit.local.json', 'utf8')).private ?? [] : [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rules = [
  ['personal email', /[a-z0-9._%+-]+@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|proton|protonmail)\.[a-z.]+/gi, (m) => m.toLowerCase() !== 'betasteward@gmail.com'],
  ['Windows user folder', /\b[A-Za-z]:?[\\/]+Users[\\/]+([A-Za-z0-9._-]+)/g, (m, u) => !['me', 'user', 'name', 'runneradmin', 'public', 'default'].includes(u.toLowerCase())],
  ['local drive path', /\b[A-Za-z]:[\\/]+projects[\\/]+([^\\/\s`'")<>,;]*)/g, (m, d) => !['game-kit', 'demo', 'x', ''].includes(d)],
  ['WSL home', /\/home\/([a-z0-9_-]+)\//g, (m, u) => !['me', 'user', 'runner', 'node'].includes(u)],
  ['tailnet host', /\b[a-z0-9-]+\.tail[0-9a-f]{4,}\.ts\.net\b|\btail[0-9a-f]{6}\b/gi, () => true],
  ['claude.ai link', /claude\.ai\/(artifact|code\/artifact|code\/session|chat)\/[A-Za-z0-9_-]{12,}/g, () => true],
  ['session id', /\blocal_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, () => true],
  ...own.map((w) => ['private word', new RegExp(esc(w), 'gi'), () => true]),
];
const DRIVE_EXEMPT = new Set(['ports.json', 'tools/game-server/boxes.json', 'docs/PORTS.md']); // the registries hold each game's repo folder on purpose
const hits = [];
for (const f of git('ls-files', '-z').split('\0').filter(Boolean)) {
  if (f === 'scripts/personal-check.mjs' || !existsSync(f)) continue;
  const buf = readFileSync(f);
  if (buf.length > 5e6 || buf.subarray(0, 8000).includes(0)) continue;
  const lines = buf.toString('utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [name, re, keep] of rules) if (!(name === 'local drive path' && DRIVE_EXEMPT.has(f))) for (const m of line.matchAll(re)) if (keep(m[0], m[1] ?? '')) hits.push(`${f}:${i + 1}: ${name}`);
  });
}
const ev = process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH) ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
for (const [where, text] of [['PR title', ev.pull_request?.title], ['PR body', ev.pull_request?.body]]) {
  for (const [name, re, keep] of rules) for (const m of (text ?? '').matchAll(re)) if (keep(m[0], m[1] ?? '')) hits.push(`${where}: ${name}`);
}
let range = '';
try { git('rev-parse', '-q', '--verify', 'origin/main'); range = 'origin/main..HEAD'; } catch { /* shallow CI checkout */ }
if (range) for (const l of git('log', range, '--format=%h %an <%ae> | %cn <%ce>').split('\n').filter(Boolean)) {
  const ok = (e) => /noreply\.github\.com>|noreply@github\.com>|noreply@anthropic\.com>/.test(e);
  const [a, c] = l.split(' | ');
  if (!ok(a) || !ok(c) || own.some((w) => l.toLowerCase().includes(w.toLowerCase()))) hits.push(`commit ${l.split(' ')[0]}: author or committer is not a noreply address`);
}
if (hits.length) {
  console.error(`personal-check: ${hits.length} hit(s); the kit is public, remove them (values not printed):\n` + hits.slice(0, 50).join('\n'));
  process.exit(1);
}
console.log('personal-check ok');
