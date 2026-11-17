import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const g = {};
for (const [f, v] of Object.entries(j)) {
  if (f === 'total') continue;
  const m = f.replace(/\\/g, '/').match(/components\/([^/]+)\//);
  if (!m) continue;
  const c = (g[m[1]] ??= { t: 0, c: 0 });
  c.t += v.lines.total;
  c.c += v.lines.covered;
}
for (const [n, c] of Object.entries(g).sort()) console.log(n.padEnd(32), (c.t ? (100 * c.c / c.t).toFixed(1) : '-').padStart(6) + '%', `${c.c}/${c.t}`);
