// Lookup commands generated on each run from the game's own data: `card <id>`, `dsl <word>`, `refs`. Never part of a test glob.
// The game's module (--module) exports `lookup` (or default): a Lookup object, or a function returning one (may be async).
// Exit 0 found, 1 not found or unresolved refs with --strict, 2 usage or a failed load.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { flags, isMain, stdio, type Io } from './args.ts';

export interface LookupCard {
  id: string;
  name?: string;
  pack?: string;
  text?: string;
  /** Set when the printed card differs from the base text: shown loudly. */
  errata?: string;
  /** Ability or script ids the card uses. */
  refs?: string[];
}
export interface LookupWord {
  name: string;
  signature?: string;
  doc?: string;
}
export interface Lookup {
  cards: LookupCard[];
  /** Where a ref is implemented (a file or module name), or null/undefined when it is not. */
  resolve?: (ref: string) => string | null | undefined;
  /** Refs left unscripted on purpose, with the reason. */
  skipped?: Record<string, string>;
  vocabulary?: LookupWord[];
}

const USAGE = 'usage: node lookup.ts --module <file> card <id> | dsl <word> | refs [--strict]';

export function card(l: Lookup, id: string): { code: number; lines: string[] } {
  const c = l.cards.find((x) => x.id === id) ?? l.cards.find((x) => x.id.toLowerCase() === id.toLowerCase());
  if (c === undefined) return { code: 1, lines: [`no card "${id}"`] };
  const lines = [`${c.id}${c.name === undefined ? '' : ` ${c.name}`}${c.pack === undefined ? '' : ` [${c.pack}]`}`];
  if (c.errata !== undefined) lines.push(`!! ERRATA: script THIS: ${c.errata}`);
  if (c.text !== undefined) lines.push(c.text);
  for (const r of c.refs ?? []) {
    const where = l.resolve?.(r);
    const skip = l.skipped?.[r];
    lines.push(`  ref ${r}: ${where != null ? `resolves in ${where}` : skip !== undefined ? `skipped (${skip})` : 'NOT RESOLVED'}`);
  }
  return { code: 0, lines };
}

export function dsl(l: Lookup, word: string): { code: number; lines: string[] } {
  const w = word.toLowerCase();
  const hits = (l.vocabulary ?? []).filter((v) => [v.name, v.signature, v.doc].some((s) => s?.toLowerCase().includes(w)));
  return hits.length === 0
    ? { code: 1, lines: [`nothing matches "${word}"`] }
    : { code: 0, lines: hits.map((v) => `${v.signature ?? v.name}${v.doc === undefined ? '' : `  // ${v.doc}`}`) };
}

/** Per pack: scripted and unscripted refs, then a paste-ready skip list of the unscripted ones. */
export function refs(l: Lookup): { unscripted: number; lines: string[] } {
  const byPack = new Map<string, Set<string>>();
  for (const c of l.cards) for (const r of c.refs ?? []) byPack.set(c.pack ?? '-', (byPack.get(c.pack ?? '-') ?? new Set<string>()).add(r));
  const lines: string[] = [];
  const open: string[] = [];
  for (const [pack, set] of [...byPack].sort(([a], [b]) => a.localeCompare(b))) {
    const bad = [...set].filter((r) => l.resolve?.(r) == null && l.skipped?.[r] === undefined).sort();
    lines.push(`${pack}: ${String(set.size - bad.length)} scripted or skipped, ${String(bad.length)} unscripted${bad.length === 0 ? '' : `: ${bad.join(', ')}`}`);
    open.push(...bad);
  }
  if (open.length > 0) lines.push('skip list:', ...open.map((r) => `  ${JSON.stringify(r)}: 'reason',`));
  return { unscripted: open.length, lines };
}

async function load(file: string): Promise<Lookup> {
  const m = (await import(pathToFileURL(resolve(file)).href)) as { lookup?: unknown; default?: unknown };
  const v = m.lookup ?? m.default;
  const l = typeof v === 'function' ? await (v as () => Lookup | Promise<Lookup>)() : v;
  if (l === null || typeof l !== 'object' || !Array.isArray((l as Lookup).cards)) throw new Error(`${file} must export a Lookup ({ cards: [...] }) as "lookup" or default`);
  return l as Lookup;
}

export async function run(args: readonly string[], io: Io = stdio): Promise<number> {
  try {
    const fa: string[] = [];
    const pos: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i] ?? '';
      if (!a.startsWith('--')) pos.push(a);
      else {
        fa.push(a);
        if (a !== '--strict' && i + 1 < args.length) fa.push(args[++i] ?? '');
      }
    }
    const f = flags(fa, ['module'], ['strict']);
    const file = f?.['module']?.[0];
    const cmd = pos[0];
    const arg = pos[1];
    if (f === null || file === undefined || cmd === undefined || (cmd !== 'refs' && ((cmd !== 'card' && cmd !== 'dsl') || arg === undefined))) {
      io.err(USAGE);
      return 2;
    }
    const l = await load(file);
    if (cmd === 'refs') {
      const x = refs(l);
      x.lines.forEach((s) => io.out(s));
      return f['strict'] !== undefined && x.unscripted > 0 ? 1 : 0;
    }
    const r = cmd === 'card' ? card(l, arg ?? '') : dsl(l, arg ?? '');
    r.lines.forEach((s) => (r.code === 1 ? io.err : io.out)(s));
    return r.code;
  } catch (error) {
    io.err(`lookup: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) void run(process.argv.slice(2)).then((c) => { process.exitCode = c; });
