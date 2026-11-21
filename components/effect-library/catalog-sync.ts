// K499: fills the derived fields of catalog.json from the code and git, and the README's effect list from catalog.json.
// node components/effect-library/catalog-sync.ts [--check] [--since] [--games <dir>]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
export const GROUPS = ['move-and-fly', 'appear-and-vanish', 'light', 'particles', 'beams', 'hits-and-destruction', 'text-and-numbers', 'signals', 'loops', 'camera'];
export const ENDS = ['as-started', 'changed', 'hidden'];
const ZONES: Record<string, readonly [number, number, number, number]> = { a: [80, 120, 120, 168], b: [520, 120, 120, 168], board: [0, 0, 720, 420] };
export const demoStage = (z: string): readonly [number, number, number, number] | undefined => ZONES[z];
type Val = number | string | boolean | number[] | null;
export interface Entry {
  id: string; option?: Record<string, unknown>; was: string[]; title: string; looks: string; use: string; tags: string[]; group: string; ends: string;
  options: Record<string, Val>; demo: { steps: { do: string; dur: number; to?: unknown }[] } & Record<string, unknown>;
  needs?: string; ms?: number; fits?: string; draws?: { by: string[]; phoneSafe: boolean }; since?: string; usedBy?: string[];
}
interface Part { kinds: Set<string>; files: Set<string> }
export interface Reg { base: Part; variants: Record<string, Part> }

const read = (f: string): string => readFileSync(join(DIR, f), 'utf8');
const INLINE = new Map<string, string>();
const fileOf = (ref: string): string => ref.split(/[#@]/)[0]!;
/** A ref is `file#fn` (that function's text), `file@key` (an inline effect) or a whole file. */
function textOf(ref: string): string {
  if (ref.includes('@')) return INLINE.get(ref) ?? '';
  const [f, fn] = ref.split('#');
  const t = read(f!);
  if (!fn) return t;
  const at = t.search(new RegExp(String.raw`^(?:export )?(?:const|(?:async )?function) ${fn}\b`, 'm'));
  if (at < 0) return '';
  const end = t.slice(at + 1).search(/^(?:export |const |function |interface |type |async function )/m);
  return end < 0 ? t.slice(at) : t.slice(at, at + 1 + end);
}
const part = (): Part => ({ kinds: new Set(), files: new Set() });
const add = (a: Part, b: Part | undefined): void => {
  b?.kinds.forEach((k) => a.kinds.add(k));
  b?.files.forEach((f) => a.files.add(f));
};

/** Every registered verb: how it draws and which files hold it, per option that switches the look. */
export function registrations(): Map<string, Reg> {
  const fx = read('effects.ts');
  const imports = new Map<string, string>();
  for (const m of fx.matchAll(/import \{([^}]+)\} from '\.\/([\w-]+\.ts)'/g))
    for (const n of m[1]!.split(',')) imports.set(n.trim().replace(/^type /, ''), m[2]!);
  const regs = new Map<string, Reg>();
  const reg = (n: string): Reg => regs.get(n) ?? (regs.set(n, { base: part(), variants: {} }), regs.get(n)!);
  const refs = (body: string, p: Part): void => {
    for (const [n, f] of imports) if (new RegExp(`\\b${n}\\b`).test(body)) p.files.add(`${f}#${n}`);
  };
  const built = fx.slice(fx.indexOf('export const BUILT_IN'), fx.indexOf('\n};', fx.indexOf('export const BUILT_IN')));
  const keys = [...built.matchAll(/^ {2}'?([\w-]+)'?:/gm)];
  keys.forEach((m, i) => {
    const p = reg(m[1]!).base;
    p.kinds.add('elements');
    const b = built.slice(m.index, keys[i + 1]?.index);
    INLINE.set(`effects.ts@${m[1]!}`, b);
    p.files.add(`effects.ts@${m[1]!}`);
    refs(b, p);
  });
  const body = fx.slice(fx.indexOf('export function registerEffects'));
  const lines = body.split('\n');
  const last = new Map<string, Part>();
  const vars = new Map<string, Part>();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    let m = /register(Effect|CanvasEffect)\(verbs, '([\w-]+)', (\w+)/.exec(l);
    if (m) {
      const p: Part = { kinds: new Set([m[1] === 'Effect' ? 'elements' : 'canvas']), files: new Set([`${imports.get(m[3]!) ?? 'effects.ts'}#${m[3]!}`]) };
      last.set(m[2]!, p);
      add(reg(m[2]!).base, p);
      continue;
    }
    m = /const (\w+) = verbs\.get\('([\w-]+)'\)/.exec(l);
    if (m) {
      vars.set(m[1]!, last.get(m[2]!)!);
      continue;
    }
    m = /^ {2}verbs\.register\('([\w-]+)'/.exec(l);
    if (m) {
      let b = l;
      const open = (s: string): number => s.split('(').length - s.split(')').length;
      while (open(b) > 0 && i < lines.length - 1) b += '\n' + lines[++i]!;
      const r = reg(m[1]!);
      const t = /call\.step\['(\w+)'\] \? (\w+) : (\w+)/.exec(b);
      if (t) {
        r.base = part();
        add(r.base, vars.get(t[3]!));
        r.variants[t[1]!] = part();
        add(r.variants[t[1]!]!, vars.get(t[2]!));
        continue;
      }
      const c = /call\.step\['(\w+)'\] \? (\w+)\?\./.exec(b);
      if (c) {
        r.base = part();
        for (const u of b.matchAll(/= (\w+)\?\.\(/g)) add(r.base, vars.get(u[1]!));
        r.variants[c[1]!] = part();
        add(r.variants[c[1]!]!, r.base);
        add(r.variants[c[1]!]!, vars.get(c[2]!));
        continue;
      }
      r.base.kinds.add('elements');
      INLINE.set(`effects.ts@${m[1]!}`, b);
      r.base.files.add(`effects.ts@${m[1]!}`);
      continue;
    }
    m = /^ {2}register(\w+)\(verbs/.exec(l);
    if (m && imports.has(`register${m[1]!}`)) {
      const f = imports.get(`register${m[1]!}`)!;
      const s = read(f);
      for (const g of s.matchAll(/(?:verbs\.register|registerGlEffect)\((?:verbs, )?'([\w-]+)'/g)) {
        const p = reg(g[1]!).base;
        p.kinds.add(g[0].startsWith('registerGl') ? 'webgl' : 'elements');
        p.files.add(f);
      }
    }
    if (l.startsWith('}')) break;
  }
  return regs;
}

const sources = (): string[] => readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.includes('.test.') && f !== 'catalog-sync.ts');
/** The file that exports a function effect, or undefined. */
export function functionFile(id: string): string | undefined {
  const f = sources().find((x) => new RegExp(`export (?:async )?function ${id}\\b`).test(read(x)));
  return f && `${f}#${id}`;
}

const LIT = String.raw`(-?\d*\.?\d+|'[^']*'|"[^"]*"|true|false|\[[-\d.,\s]+\])`;
const lit = (s: string): Val => (/^['"]/.test(s) ? s.slice(1, -1) : s === 'true' ? true : s === 'false' ? false : s.startsWith('[') ? s.slice(1, -1).split(',').map(Number) : Number(s));
function defaultsObject(name: string): string {
  const d = read('defaults.ts');
  const at = d.indexOf(`export const ${name} =`);
  if (at < 0) return '';
  let depth = 0;
  for (let i = d.indexOf('{', at); i < d.length; i++) {
    if (d[i] === '{') depth++;
    if (d[i] === '}' && --depth === 0) return d.slice(at, i + 1);
  }
  return '';
}
/** The default of an option as the code writes it, or null when the code has none (off, required or computed). */
export function optionDefault(name: string, files: readonly string[]): Val {
  const texts = files.map(textOf);
  const objs = [...new Set(files.map((f) => read(fileOf(f))).flatMap((t) => [...t.matchAll(/\b([A-Z_]+_DEFAULTS)\b/g)].map((m) => m[1]!)))].map(defaultsObject);
  for (const o of objs) {
    const m = new RegExp(String.raw`[{,\s]${name}:\s*${LIT}\s*(?:as [^,}]+)?[,}]`).exec(o);
    if (m) return lit(m[1]!);
  }
  for (const t of texts) {
    const m = new RegExp(String.raw`[{,]\s*${name}\s*=\s*${LIT}\s*[,}\n]`).exec(t) ?? new RegExp(String.raw`(?:\['${name}'\]|\.${name})\s*\?\?\s*${LIT}`).exec(t);
    if (m) return lit(m[1]!);
  }
  return null;
}

function partOf(e: Entry, regs: Map<string, Reg>): Part | undefined {
  const r = regs.get(e.id);
  if (!r) return undefined;
  const k = Object.keys(e.option ?? {}).find((o) => r.variants[o]);
  if (!k) return r.base;
  const p = part();
  add(p, r.variants[k]);
  r.base.files.forEach((f) => p.files.add(f));
  return p;
}
function filesOf(e: Entry, regs: Map<string, Reg>): string[] {
  const p = partOf(e, regs);
  if (p) return [...p.files];
  const f = functionFile(e.id);
  return f ? [f] : [];
}

/** The fields a machine derives for one entry (all but `since` and `usedBy`). */
export function derive(e: Entry, regs: Map<string, Reg>): Pick<Entry, 'needs' | 'ms' | 'fits' | 'draws' | 'options'> {
  const step = e.demo.steps.find((s) => s.do === e.id) ?? e.demo.steps[0]!;
  const ms = step.dur;
  const files = filesOf(e, regs);
  let kinds = partOf(e, regs)?.kinds;
  if (!kinds) {
    const t = files.map(textOf).join('\n');
    kinds = new Set([/getContext\('webgl2'\)/.test(t) ? 'webgl' : /CanvasRenderingContext2D|getContext\('2d'\)/.test(t) ? 'canvas' : 'elements']);
  }
  const by = [...kinds].sort();
  return {
    needs: typeof step.to === 'string' || Array.isArray(step.to) ? 'source and target' : 'one thing',
    ms,
    fits: ms <= 400 ? 'constant' : ms <= 900 ? 'each round' : 'rare',
    draws: { by, phoneSafe: !by.includes('webgl') },
    options: Object.fromEntries(Object.keys(e.options).map((o) => [o, optionDefault(o, files)])),
  };
}

const git = (...a: string[]): string => execFileSync('git', a, { cwd: DIR, encoding: 'utf8' }).trim();
/** The first tag holding the commit that brought the entry in (git -S on its id or option), or `untagged`. */
export function since(e: Entry, regs: Map<string, Reg>): string {
  const verb = regs.has(e.id);
  const files = [...new Set([...filesOf(e, regs).map(fileOf), ...(verb ? ['effects.ts'] : [])])].map((f) => join(DIR, f));
  const first = (...needles: string[]): string => needles.map((n) => git('log', '--reverse', '--format=%ct %H', `-S${n}`, '--', ...files).split('\n')[0] ?? '').filter(Boolean).sort()[0]?.split(' ')[1] ?? '';
  const shas = [verb ? first(`'${e.id}'`, `\n  ${e.id}: `) : first(`function ${e.id}`)];
  for (const [k, v] of Object.entries(e.option ?? {})) shas.push(first(typeof v === 'string' ? `'${v}'` : k));
  if (shas.some((x) => !x)) return 'untagged';
  const tags = shas.filter(Boolean).map((s) => git('tag', '--contains', s, '--sort=creatordate').split('\n')[0] ?? '');
  if (tags.some((t) => !t)) return 'untagged';
  return tags.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1) ?? 'untagged';
}

function texts(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (['node_modules', '.git', 'kit', 'dist', 'test-results', 'build'].includes(n) || n.startsWith('.')) continue;
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) texts(p, out);
    else if (/\.(tsx?|json|mjs|js)$/.test(n) && s.size < 2_000_000) out.push(readFileSync(p, 'utf8'));
  }
  return out;
}
/** Games under `root` whose kit copy holds effect-library and whose own code uses the entry. */
export function usedBy(entries: readonly Entry[], root: string): Map<Entry, string[]> {
  const games = readdirSync(root).filter((g) => existsSync(join(root, g, 'kit', 'effect-library')) && statSync(join(root, g, '.git'), { throwIfNoEntry: false })?.isDirectory());
  const code = new Map(games.map((g) => [g, texts(join(root, g)).join('\n')]));
  return new Map(entries.map((e) => [e, games.filter((g) => new RegExp(e.id.includes('-') || !/[A-Z]/.test(e.id) ? String.raw`\bdo['"]?\s*:\s*['"]${e.id}['"]` : String.raw`\b${e.id}\(`).test(code.get(g)!)).sort()]));
}

/** The README's effect list: one line per entry, by group. */
export function readmeSection(entries: readonly Entry[]): string {
  const out = ['<!-- effects:start (written by catalog-sync.ts from catalog.json) -->', '## Effects by group', ''];
  for (const g of GROUPS) {
    out.push(`**${g}**`, '');
    for (const e of entries.filter((x) => x.group === g)) out.push(`- \`${e.id}\`${e.option ? ` (${Object.entries(e.option).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')})` : ''}: ${e.title}`);
    out.push('');
  }
  out.push('<!-- effects:end -->');
  return out.join('\n');
}
export function withSection(readme: string, entries: readonly Entry[]): string {
  const a = readme.indexOf('<!-- effects:start');
  const b = readme.indexOf('<!-- effects:end -->');
  if (a >= 0 && b > a) return readme.slice(0, a) + readmeSection(entries) + readme.slice(b + '<!-- effects:end -->'.length);
  const at = readme.indexOf('\n## ');
  return `${readme.slice(0, at + 1)}${readmeSection(entries)}\n${readme.slice(at)}`;
}

const ORDER = ['id', 'option', 'was', 'title', 'looks', 'use', 'tags', 'group', 'ends', 'needs', 'ms', 'fits', 'draws', 'options', 'since', 'usedBy', 'demo'];
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2);
  const path = join(DIR, 'catalog.json');
  const before = readFileSync(path, 'utf8');
  const entries = JSON.parse(before) as Entry[];
  const regs = registrations();
  const games = a.includes('--games') ? usedBy(entries, a[a.indexOf('--games') + 1]!) : undefined;
  const next = entries.map((e) => {
    const n: Entry = { ...e, ...derive(e, regs), since: a.includes('--since') || !e.since ? since(e, regs) : e.since, usedBy: games?.get(e) ?? e.usedBy ?? [] };
    return Object.fromEntries(ORDER.filter((k) => k in n).map((k) => [k, n[k as keyof Entry]]));
  });
  const json = JSON.stringify(next, null, 1) + '\n';
  const rp = join(DIR, 'README.md');
  const readme = readFileSync(rp, 'utf8');
  const doc = withSection(readme, next as unknown as Entry[]);
  if (a.includes('--check')) {
    if (json !== before || doc !== readme) {
      console.error('catalog.json or README.md is stale: run node components/effect-library/catalog-sync.ts');
      process.exit(1);
    }
  } else {
    writeFileSync(path, json);
    writeFileSync(rp, doc);
  }
}
