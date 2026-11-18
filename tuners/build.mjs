// K312: builds each tuners/src/<name>.html into tuners/<name>.html, one self-contained page with the kit's own code inlined:
// `/*@kit-css <path>*/` becomes that CSS file, `//@kit-js <path> as <NAME>` becomes that module bundled (esbuild) as global NAME.
// `--check` fails when a built page is out of date with its source or the kit code it inlines.
import fs from 'node:fs';
import path from 'node:path';
import { buildSync } from 'esbuild';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'tuners');
const check = process.argv.includes('--check');
const stale = [];
const norm = (s) => s.replace(/\r\n/g, '\n');
for (const f of fs.readdirSync(path.join(dir, 'src')).filter((f) => f.endsWith('.html'))) {
  let html = norm(fs.readFileSync(path.join(dir, 'src', f), 'utf8'));
  html = html.replace(/\/\*@kit-css (\S+)\*\//g, (_, p) => `/* ===== game-kit ${p}, inlined by tuners/build.mjs ===== */\n${norm(fs.readFileSync(path.join(root, p), 'utf8'))}`);
  html = html.replace(/\/\/@kit-js (\S+) as (\w+)/g, (_, p, name) =>
    norm(buildSync({ entryPoints: [path.join(root, p)], bundle: true, loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, format: 'iife', globalName: name, write: false, absWorkingDir: root, preserveSymlinks: true, target: 'es2022', legalComments: 'none', logLevel: 'error' }).outputFiles[0].text));
  const out = path.join(dir, f);
  if (!check) fs.writeFileSync(out, html);
  else if (!fs.existsSync(out) || norm(fs.readFileSync(out, 'utf8')) !== html) stale.push(f);
}
if (stale.length > 0) {
  console.error(`tuners out of date, run node tuners/build.mjs: ${stale.join(', ')}`);
  process.exit(1);
}
