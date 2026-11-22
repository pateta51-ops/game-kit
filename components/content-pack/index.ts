import type { ZodType } from 'zod';
import { parseCsv } from '../card-harness/csv.ts';
import { validateEffect, type AnyVerbTable } from '../card-language/index.ts';

export type Kind = {
  readonly schema: ZodType;
  readonly id?: string;
  readonly refs?: Readonly<Record<string, string>>;
  readonly effects?: readonly string[];
};
export type PackDef = {
  readonly kinds: Readonly<Record<string, Kind>>;
  readonly verbs?: AnyVerbTable;
  readonly check?: (kind: string, record: unknown, all: Readonly<Record<string, readonly unknown[]>>) => readonly string[];
};
export type Loaded = { readonly records: Readonly<Record<string, readonly unknown[]>>; readonly byId: ReadonlyMap<string, unknown> };
export type LoadResult = { readonly ok: true; readonly pack: Loaded } | { readonly ok: false; readonly problems: string[] };
export type Source = { readonly csv: string } | { readonly json: string };

const idOf = (k: Kind, r: unknown): unknown => (r as Record<string, unknown> | null)?.[k.id ?? 'id'];

export function load(def: PackDef, data: Readonly<Record<string, readonly unknown[]>>): LoadResult {
  const problems: string[] = [];
  const records: Record<string, unknown[]> = {};
  const ids: Record<string, Map<string, unknown>> = {};
  const where = (kind: string, i: number, r: unknown, k: Kind) => `${kind}[${String(i)}]${typeof idOf(k, r) === 'string' ? ` (id "${String(idOf(k, r))}")` : ''}`;
  for (const kind of Object.keys(data)) if (!Object.hasOwn(def.kinds, kind)) problems.push(`unknown kind "${kind}"`);
  for (const [kind, k] of Object.entries(def.kinds)) {
    const out: unknown[] = [];
    const seen = new Map<string, unknown>();
    (data[kind] ?? []).forEach((raw, i) => {
      const parsed = k.schema.safeParse(raw);
      if (!parsed.success) {
        for (const is of parsed.error.issues) problems.push(`${where(kind, i, raw, k)}: ${is.path.join('.') || '(record)'}: ${is.message}`);
        const rid = idOf(k, raw);
        if (typeof rid === 'string' && rid !== '' && !seen.has(rid)) seen.set(rid, raw);
        return;
      }
      const id = idOf(k, parsed.data);
      if (typeof id !== 'string' || id === '') return void problems.push(`${where(kind, i, raw, k)}: missing id field "${k.id ?? 'id'}"`);
      if (seen.has(id)) problems.push(`${kind}: duplicate id "${id}" (at ${String(i)})`);
      else seen.set(id, parsed.data);
      out.push(parsed.data);
    });
    records[kind] = out;
    ids[kind] = seen;
  }
  for (const [kind, k] of Object.entries(def.kinds)) {
    for (const [field, target] of Object.entries(k.refs ?? {})) if (!Object.hasOwn(def.kinds, target)) problems.push(`definition: ${kind}.${field} refers to unknown kind "${target}"`);
    (records[kind] ?? []).forEach((r, i) => {
      for (const [field, target] of Object.entries(k.refs ?? {})) {
        const v = (r as Record<string, unknown>)[field];
        for (const ref of Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]) {
          if (ids[target] !== undefined && (typeof ref !== 'string' || !ids[target].has(ref))) problems.push(`${where(kind, i, r, k)}: ${field} refers to ${target} "${String(ref)}", which does not exist`);
        }
      }
      for (const field of k.effects ?? []) {
        const v = (r as Record<string, unknown>)[field];
        if (def.verbs !== undefined && v !== undefined) for (const p of validateEffect(def.verbs, v)) problems.push(`${where(kind, i, r, k)}: ${field}: ${p}`);
      }
      for (const p of def.check?.(kind, r, records) ?? []) problems.push(`${where(kind, i, r, k)}: ${p}`);
    });
  }
  if (problems.length > 0) return { ok: false, problems };
  const byId = new Map<string, unknown>();
  for (const [kind, m] of Object.entries(ids)) for (const [id, r] of m) byId.set(`${kind}:${id}`, r);
  return { ok: true, pack: { records, byId } };
}

export function rowsOf(kind: string, src: Source): { rows: unknown[]; problems: string[] } {
  try {
    if ('csv' in src) return { rows: parseCsv(src.csv), problems: [] };
    const v: unknown = JSON.parse(src.json);
    if (Array.isArray(v)) return { rows: v, problems: [] };
    return { rows: [], problems: [`${kind}: JSON must be a list of records`] };
  } catch (e) {
    return { rows: [], problems: [`${kind}: bad ${'csv' in src ? 'CSV' : 'JSON'}:${(e as Error).message}`] };
  }
}

export function loadText(def: PackDef, files: Readonly<Record<string, Source>>): LoadResult {
  const data: Record<string, unknown[]> = {};
  const bad: string[] = [];
  for (const [kind, src] of Object.entries(files)) {
    const { rows, problems } = rowsOf(kind, src);
    data[kind] = rows;
    bad.push(...problems);
  }
  const r = load(def, data);
  if (bad.length === 0) return r;
  return { ok: false, problems: [...bad, ...(r.ok ? [] : r.problems)] };
}

export function loadOrThrow(def: PackDef, data: Readonly<Record<string, readonly unknown[]>>): Loaded {
  const r = load(def, data);
  if (!r.ok) throw new Error(`content pack refused (${String(r.problems.length)} problems):\n${r.problems.join('\n')}`);
  return r.pack;
}
export { dossierRow, type DossierOptions, type DossierRecord } from './dossier.ts';
