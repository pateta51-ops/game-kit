// Strict validator for a card language held as plain JSON (K97). The grammar is data: per node kind (the value of the
// `tag` key) its allowed keys, required keys, the keys that bind a variable (seen by everything after the node), bind
// one for its own children only (a loop's `as`), or read one. Fails: non-JSON values, unknown node kinds, unknown keys
// (a key another kind owns is reported as in the wrong place), missing keys, and a variable read before it is bound.
// An exception is an opt-out stored as data, `{ rule, path?, citation }`: no citation, or one that matches nothing, fails.
// `grammarReference` writes the reference for workers from the same grammar, so it cannot drift from the validator.

export interface NodeSpec {
  readonly keys: readonly string[];
  readonly required?: readonly string[];
  readonly binds?: readonly string[];
  readonly scopes?: readonly string[];
  readonly reads?: readonly string[];
  readonly note?: string;
}
export interface Grammar {
  /** The key naming a node's kind (default `op`). */
  readonly tag?: string;
  readonly nodes: Readonly<Record<string, NodeSpec>>;
  /** A string anywhere that matches reads the variable in group 1 (e.g. `/^\$(\w+)$/`). */
  readonly ref?: RegExp;
  /** Variables every definition has for free (`self`, `source`). */
  readonly given?: readonly string[];
}
export type StrictRule = 'json' | 'unknown-node' | 'unknown-key' | 'wrong-place' | 'missing-key' | 'unbound' | 'opt-out-uncited' | 'opt-out-stale';
export interface StrictProblem {
  readonly rule: StrictRule;
  readonly path: string;
  readonly message: string;
}
export interface OptOut {
  readonly rule: StrictRule;
  /** Only the problem at this path (default: every problem of the rule). */
  readonly path?: string;
  readonly citation: string;
}

export function strictProblems(grammar: Grammar, def: unknown, optOuts: readonly OptOut[] = []): StrictProblem[] {
  const tag = grammar.tag ?? 'op';
  const out: StrictProblem[] = [];
  const add = (rule: StrictRule, path: string, message: string): void => void out.push({ rule, path, message: `${path || '(root)'}: ${message}` });
  const owners = (k: string): string[] => Object.keys(grammar.nodes).filter((n) => grammar.nodes[n]?.keys.includes(k));
  const read = (v: unknown, path: string, bound: Set<string>): void => {
    for (const x of Array.isArray(v) ? v : [v]) {
      const n = typeof x === 'string' ? grammar.ref?.exec(x)?.[1] ?? x : undefined;
      if (n !== undefined && !bound.has(n)) add('unbound', path, `reads ${n} before it is bound`);
    }
  };
  const walk = (v: unknown, path: string, bound: Set<string>): void => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') {
      const m = typeof v === 'string' ? grammar.ref?.exec(v) : null;
      if (m?.[1] !== undefined && !bound.has(m[1])) add('unbound', path, `reads ${m[1]} before it is bound`);
      return;
    }
    if (typeof v === 'number') return void (Number.isFinite(v) || add('json', path, `${String(v)} is not JSON`));
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${String(i)}]`, bound));
    if (typeof v !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(v) as object | null))
      return add('json', path, `a ${typeof v === 'object' ? (v.constructor as { name?: string } | undefined)?.name ?? 'object' : typeof v} is not plain JSON`);
    const o = v as Record<string, unknown>;
    const at = (k: string): string => (path ? `${path}.${k}` : k);
    const kind = o[tag];
    if (kind === undefined) return Object.keys(o).forEach((k) => walk(o[k], at(k), bound));
    const spec = typeof kind === 'string' ? grammar.nodes[kind] : undefined;
    if (typeof kind !== 'string' || spec === undefined) return add('unknown-node', at(tag), `unknown ${tag} ${JSON.stringify(kind)}`);
    for (const k of spec.required ?? []) if (!(k in o)) add('missing-key', path, `${kind} needs ${k}`);
    for (const k of Object.keys(o)) {
      if (k === tag || spec.keys.includes(k)) continue;
      const own = owners(k);
      if (own.length > 0) add('wrong-place', at(k), `${k} belongs to ${own.join(', ')}, not ${kind}`);
      else add('unknown-key', at(k), `${kind} has no key ${k}`);
    }
    const ids = (k: string): string[] => [o[k]].flat().filter((x): x is string => typeof x === 'string');
    for (const k of spec.reads ?? []) if (k in o) read(o[k], at(k), bound);
    const skip = new Set([tag, ...(spec.reads ?? []), ...(spec.binds ?? []), ...(spec.scopes ?? [])]);
    const inner = new Set([...bound, ...(spec.scopes ?? []).flatMap(ids)]);
    for (const k of Object.keys(o)) if (!skip.has(k)) walk(o[k], at(k), inner);
    for (const k of spec.binds ?? []) for (const x of ids(k)) bound.add(x);
    for (const x of inner) if (!bound.has(x) && !(spec.scopes ?? []).flatMap(ids).includes(x)) bound.add(x);
  };
  walk(def, '', new Set(grammar.given ?? []));
  const used = new Set<OptOut>();
  const kept = out.filter((p) => {
    const o = optOuts.find((x) => x.rule === p.rule && (x.path === undefined || x.path === p.path) && x.citation.trim() !== '');
    if (o !== undefined) used.add(o);
    return o === undefined;
  });
  for (const o of optOuts) {
    const where = `opt-out ${o.rule}${o.path === undefined ? '' : ` at ${o.path}`}`;
    if (o.citation.trim() === '') kept.push({ rule: 'opt-out-uncited', path: o.path ?? '', message: `${where} has no citation` });
    else if (!used.has(o)) kept.push({ rule: 'opt-out-stale', path: o.path ?? '', message: `${where} matches nothing` });
  }
  return kept;
}

/** Markdown reference for workers, generated from the grammar the validator uses. */
export function grammarReference(grammar: Grammar, title = 'Card language: grammar reference'): string {
  const tag = grammar.tag ?? 'op';
  const list = (xs: readonly string[] | undefined): string => (xs ?? []).map((x) => `\`${x}\``).join(', ');
  const lines = [`# ${title}`, '', `Generated; do not edit by hand. A node is an object whose \`${tag}\` names its kind; any other key fails.`, ''];
  if (grammar.given !== undefined) lines.push(`Bound for free: ${list(grammar.given)}.`, '');
  if (grammar.ref !== undefined) lines.push(`A string matching \`${grammar.ref.source}\` reads a variable.`, '');
  lines.push(`| ${tag} | Keys | Required | Binds | Binds for its children | Reads | Note |`, '|---|---|---|---|---|---|---|');
  for (const n of Object.keys(grammar.nodes).sort()) {
    const s = grammar.nodes[n] as NodeSpec;
    lines.push(`| \`${n}\` | ${list(s.keys)} | ${list(s.required)} | ${list(s.binds)} | ${list(s.scopes)} | ${list(s.reads)} | ${s.note ?? ''} |`);
  }
  return lines.join('\n') + '\n';
}
