// K453: says whether a change touches only docs, so ci.yml's heavy `check` job can be skipped (its required check still reports).
//   BASE=<sha> node docs-only.mjs [<head, default HEAD>]   prints docs=true|false; also appended to GITHUB_OUTPUT
// DOCS_PATHS: comma list of globs (default docs/**,**/*.md,*.md). Any doubt (no base, git error, no changed file) is false.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const glob = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('**/', '\u0001').replaceAll('**', '\u0002').replaceAll('*', '[^/]*').replaceAll('\u0001', '(?:.*/)?').replaceAll('\u0002', '.*')}$`);
let docs = false;
const base = process.env.BASE ?? '';
if (/^[0-9a-f]{40}$/.test(base) && !/^0+$/.test(base)) {
  try {
    const files = execFileSync('git', ['diff', '--name-only', base, process.argv[2] ?? 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const globs = process.env.DOCS_PATHS?.split(',').map((s) => s.trim()).filter(Boolean) ?? ['docs/**', '**/*.md', '*.md'];
    docs = files.length > 0 && files.every((f) => globs.some((g) => glob(g).test(f)));
  } catch {
    docs = false;
  }
}
console.log(`docs=${docs}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `docs=${docs}\n`);
