// The docs index with a section reader: `--dir docs` lists each markdown file with its headings and line numbers;
// `--file <md> --section <heading>` prints one section (up to the next heading of the same or a higher level), so an agent
// reads a section, not the whole file. A section is found by exact heading text, else by the first heading that contains it.
// Exit 0 done, 1 section not found, 2 usage or a failed read.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';

export interface Heading {
  level: number;
  text: string;
  line: number;
}
/** The `#` headings of a markdown text (not those inside a code fence); `line` counts from 1. */
export function headings(text: string): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  text.split(/\r?\n/).forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const m = fence ? null : /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (m !== null) out.push({ level: (m[1] ?? '').length, text: m[2] ?? '', line: i + 1 });
  });
  return out;
}

/** The lines of the section called `name` (its heading included), or null. */
export function section(text: string, name: string): string | null {
  const hs = headings(text);
  const want = name.toLowerCase();
  const at = hs.findIndex((h) => h.text.toLowerCase() === want) >= 0 ? hs.findIndex((h) => h.text.toLowerCase() === want) : hs.findIndex((h) => h.text.toLowerCase().includes(want));
  const h = hs[at];
  if (h === undefined) return null;
  const end = hs.slice(at + 1).find((n) => n.level <= h.level);
  return text.split(/\r?\n/).slice(h.line - 1, end === undefined ? undefined : end.line - 1).join('\n').trimEnd();
}

function mdFiles(dir: string, base = ''): string[] {
  return readdirSync(join(dir, base), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => (e.isDirectory() ? (e.name.startsWith('.') || e.name === 'node_modules' ? [] : mdFiles(dir, `${base}${e.name}/`)) : e.name.endsWith('.md') ? [`${base}${e.name}`] : []));
}

const NAMES = ['dir', 'file', 'section', 'depth'];
const USAGE = 'usage: tsx docs-index.ts (--dir <folder> [--depth <max heading level, default 2>] | --file <md> [--section <heading>])';

export function run(args: readonly string[], io: Io = stdio): number {
  try {
    const f = flags(args, NAMES);
    const [dir, file, name] = [f?.['dir']?.[0], f?.['file']?.[0], f?.['section']?.[0]];
    if (f === null || (dir === undefined) === (file === undefined) || (name !== undefined && file === undefined)) {
      io.err(USAGE);
      return 2;
    }
    if (file !== undefined) {
      const text = readFileSync(resolve(file), 'utf8');
      if (name === undefined) {
        for (const h of headings(text)) io.out(`${String(h.line)}: ${'#'.repeat(h.level)} ${h.text}`);
        return 0;
      }
      const s = section(text, name);
      if (s === null) {
        io.err(`docs-index: no heading "${name}" in ${file}`);
        return 1;
      }
      io.out(s);
      return 0;
    }
    const depth = Number(f['depth']?.[0] ?? 2);
    const root = resolve(dir ?? '.');
    for (const p of mdFiles(root)) {
      io.out(p);
      for (const h of headings(readFileSync(join(root, p), 'utf8'))) if (h.level <= depth) io.out(`  ${String(h.line)}: ${'#'.repeat(h.level)} ${h.text}`);
    }
    return 0;
  } catch (error) {
    io.err(`docs-index: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
