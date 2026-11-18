import { load, type LoadResult, type PackDef } from './index.ts';

export type Product = {
  readonly id: string;
  readonly name?: string;
  readonly kind?: 'base' | 'expansion' | 'variant';
  readonly dependsOn?: readonly string[];
  /** A reason the product cannot be chosen (listed, not tickable). */
  readonly unavailable?: string;
};
export type Registry = readonly Product[];
export type Choice = { readonly base: string; readonly packs: readonly string[] };

const kindOf = (p: Product) => p.kind ?? 'base';
const get = (r: Registry, id: string) => r.find((p) => p.id === id);
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const uniq = (xs: Iterable<string>) => [...new Set(xs)].sort(byId);

/** The shortest dependsOn path from `id` back to itself ([id, ..., id]), or null (ER dependencyCycle). */
export function dependencyCycle(r: Registry, id: string): string[] | null {
  const from = new Map<string, string>();
  const queue = [id];
  while (queue.length > 0) {
    const x = queue.shift() as string;
    for (const d of get(r, x)?.dependsOn ?? []) {
      if (d === id) {
        const back: string[] = [];
        for (let y = x; y !== id; y = from.get(y) as string) back.push(y);
        return [id, ...back.reverse(), id];
      }
      if (!from.has(d) && get(r, d)) {
        from.set(d, x);
        queue.push(d);
      }
    }
  }
  return null;
}

/** `id` and everything it needs, transitively, sorted; unknown ids are left out (see checkRegistry). Throws on a cycle (ER E_PACK_CYCLE). */
export function dependencyClosure(r: Registry, id: string): string[] {
  const cycle = dependencyCycle(r, id);
  if (cycle) throw new Error(`${id} depends on itself: ${cycle.join(' -> ')}`);
  const out = new Set<string>();
  const visit = (x: string): void => {
    if (out.has(x) || !get(r, x)) return;
    out.add(x);
    for (const d of get(r, x)?.dependsOn ?? []) visit(d);
  };
  visit(id);
  return [...out].sort(byId);
}

/** Every problem of a registry: duplicate ids, unknown dependencies, cycles. */
export function checkRegistry(r: Registry): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of r) {
    if (seen.has(p.id)) out.push(`duplicate product "${p.id}"`);
    seen.add(p.id);
  }
  for (const p of r) {
    for (const d of p.dependsOn ?? []) if (!get(r, d)) out.push(`${p.id} depends on "${d}", which is not in the registry`);
    const c = dependencyCycle(r, p.id);
    if (c) out.push(`${p.id} depends on itself: ${c.join(' -> ')}`);
  }
  return out;
}

/** Products that need `base`, directly or not, and are not bases themselves (ER productsOf). */
export function productsOf(r: Registry, base: string): Product[] {
  const reaches = (id: string, seen = new Set<string>()): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    return (get(r, id)?.dependsOn ?? []).some((d) => d === base || reaches(d, seen));
  };
  return r.filter((p) => kindOf(p) !== 'base' && reaches(p.id));
}

/** `id` ticked together with what it needs (nothing changes when something it needs is unavailable). The base is never in the list. */
export function tick(r: Registry, base: string, ticked: readonly string[], id: string): string[] {
  const add = dependencyClosure(r, id).filter((x) => x !== base);
  if (add.some((x) => get(r, x)?.unavailable !== undefined)) return uniq(ticked);
  return uniq([...ticked, ...add]);
}

/** `id` unticked together with everything ticked that needs it (ER toggleProduct). */
export function untick(r: Registry, ticked: readonly string[], id: string): string[] {
  const out = new Set(ticked);
  const drop = (x: string): void => {
    out.delete(x);
    for (const p of r) if (out.has(p.id) && (p.dependsOn ?? []).includes(x)) drop(p.id);
  };
  drop(id);
  return uniq(out);
}

export const toggle = (r: Registry, base: string, ticked: readonly string[], id: string, on: boolean): string[] =>
  on ? tick(r, base, ticked, id) : untick(r, ticked, id);

/** The choice as a plain value: the base and every chosen pack (base included), sorted and deduplicated. */
export const makeChoice = (base: string, ticked: readonly string[]): Choice => ({ base, packs: uniq([base, ...ticked]) });
export const choiceToJson = (c: Choice): string => JSON.stringify({ base: c.base, packs: uniq(c.packs) });

/** Reads a choice back; null when it is not one, or does not hold against the registry (unknown pack, a needed pack not chosen). */
export function choiceFromJson(r: Registry, text: string): Choice | null {
  try {
    const v = JSON.parse(text) as { base?: unknown; packs?: unknown };
    if (typeof v.base !== 'string' || !Array.isArray(v.packs) || !v.packs.every((x) => typeof x === 'string')) return null;
    const c = makeChoice(v.base, v.packs);
    if (!get(r, c.base) || c.packs.some((p) => !get(r, p))) return null;
    for (const p of c.packs) if (!dependencyClosure(r, p).every((d) => c.packs.includes(d))) return null;
    return c;
  } catch {
    return null;
  }
}

const RANK = { base: 0, expansion: 1, variant: 2 } as const;

/** Merge order (ER mergeOrder): bases, then expansions, then variants; a pack after what it needs; then by id. Independent of input order. */
export function mergeOrder<T extends { readonly id: string }>(r: Registry, items: readonly T[]): T[] {
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ds = get(r, id)?.dependsOn ?? [];
    const d = ds.length > 0 ? 1 + Math.max(...ds.map((x) => depthOf(x, seen))) : 0;
    depth.set(id, d);
    return d;
  };
  for (const p of [...r].sort((a, b) => byId(a.id, b.id))) depthOf(p.id, new Set());
  const rank = (id: string) => RANK[kindOf(get(r, id) ?? { id })];
  return [...items].sort((a, b) => rank(a.id) - rank(b.id) || (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) || byId(a.id, b.id));
}

export type PackData = {
  readonly id: string;
  readonly data: Readonly<Record<string, readonly unknown[]>>;
  /** The record `by` (of this pack) stands in for the record `id` of a pack this one needs (ER `replaces`). */
  readonly replaces?: readonly { readonly kind: string; readonly id: string; readonly by: string }[];
};
export type MergeOptions = {
  /** 'all' (default): an expansion's replacements apply; 'variantsOnly': only a variant's do, an expansion's `by` records are dropped. */
  readonly replacements?: 'all' | 'variantsOnly';
  /** Field set on a replacing record to the `by` id it was printed as. Default 'printedAs'. */
  readonly printedAs?: string;
};
export type Merged =
  | { readonly ok: true; readonly pack: Extract<LoadResult, { ok: true }>['pack']; readonly order: readonly string[] }
  | { readonly ok: false; readonly problems: string[] };

/**
 * Merges the chosen packs into one index (ER mergePacks): every chosen pack and what it needs must be given and chosen;
 * no cycle; one owner per record id (E_PACK_CONFLICT across packs, E_DUP_ID inside one); a replacement puts the `by`
 * record under the replaced id and drops `by` (an inactive one drops `by` and keeps the original); a variant is all
 * its records or none (E_VARIANT_PARTIAL). The result goes through `load(def, ...)`: schema, reference and extra checks apply to the whole.
 */
export function mergePacks(def: PackDef, r: Registry, packs: readonly PackData[], choice: Choice, opts: MergeOptions = {}): Merged {
  const problems: string[] = [];
  const given = new Map<string, PackData>();
  for (const p of packs) {
    if (given.has(p.id)) problems.push(`E_PACK_CONFLICT: pack ${p.id} is given twice`);
    else given.set(p.id, p);
  }
  const enabled = new Set(choice.packs);
  for (const id of [...enabled].sort(byId)) {
    if (!given.has(id)) problems.push(`E_PACK_MISSING: pack ${id} is chosen but not given`);
    for (const d of get(r, id)?.dependsOn ?? []) if (!enabled.has(d)) problems.push(`E_PACK_MISSING: ${id} needs ${d}, which is not chosen`);
    const cycle = dependencyCycle(r, id);
    if (cycle) problems.push(`E_PACK_CYCLE: ${id} depends on itself: ${cycle.join(' -> ')}`);
  }
  if (problems.length > 0) return { ok: false, problems };
  const order = mergeOrder(r, [...enabled].map((id) => ({ id }))).map((x) => x.id);
  const closure = new Map(order.map((id) => [id, new Set(dependencyClosure(r, id))]));
  const idField = (kind: string) => def.kinds[kind]?.id ?? 'id';
  const recId = (kind: string, rec: unknown) => (rec as Record<string, unknown>)[idField(kind)];
  const printedAs = opts.printedAs ?? 'printedAs';
  const owner = new Map<string, string>();
  const merged: Record<string, unknown[]> = {};
  for (const id of order) {
    const pd = given.get(id) as PackData;
    for (const [kind, rows] of Object.entries(pd.data)) {
      const out = (merged[kind] ??= []);
      for (const rec of rows) {
        const rid = recId(kind, rec);
        if (typeof rid !== 'string') {
          out.push(rec);
          continue;
        }
        const other = owner.get(`${kind}:${rid}`);
        if (other === undefined) {
          owner.set(`${kind}:${rid}`, id);
          out.push(rec);
        } else if (other !== id) problems.push(`E_PACK_CONFLICT: ${kind} ${rid} is in both ${other} and ${id}`);
        else problems.push(`E_DUP_ID: ${kind} ${rid} twice in ${id}`);
      }
    }
  }
  const taken = new Map<string, string>();
  const dropBy = new Set<string>();
  for (const id of order) {
    const pd = given.get(id) as PackData;
    const variant = kindOf(get(r, id) as Product) === 'variant';
    const bad = variant ? 'E_VARIANT_PARTIAL' : 'E_REF_RECORD';
    const list = pd.replaces ?? [];
    if (variant) {
      const bys = new Set(list.map((x) => `${x.kind}:${x.by}`));
      for (const [kind, rows] of Object.entries(pd.data))
        for (const rec of rows)
          if (!bys.has(`${kind}:${String(recId(kind, rec))}`)) problems.push(`E_VARIANT_PARTIAL: ${kind} ${String(recId(kind, rec))} replaces nothing: a variant is all its records or none`);
    }
    const active = variant || opts.replacements !== 'variantsOnly';
    list.forEach((x, i) => {
      const path = `${id}.replaces[${String(i)}]`;
      if (owner.get(`${x.kind}:${x.by}`) !== id) return void problems.push(`${bad}: ${path}.by: ${x.by} is not a ${x.kind} of ${id}`);
      const from = owner.get(`${x.kind}:${x.id}`);
      if (from === undefined || from === id || !closure.get(id)?.has(from)) return void problems.push(`${bad}: ${path}.id: ${x.id} is not a ${x.kind} of a pack ${id} needs`);
      const prior = taken.get(`${x.kind}:${x.id}`);
      if (prior !== undefined) return void problems.push(`E_PACK_CONFLICT: ${x.kind} ${x.id} is replaced by both ${prior} and ${id}`);
      taken.set(`${x.kind}:${x.id}`, id);
      const rows = merged[x.kind] as unknown[];
      const by = rows.find((rec) => recId(x.kind, rec) === x.by);
      const at = rows.findIndex((rec) => recId(x.kind, rec) === x.id);
      if (active && by !== undefined && at >= 0) rows[at] = { ...(by as object), [idField(x.kind)]: x.id, [printedAs]: x.by };
      dropBy.add(`${x.kind}:${x.by}`);
    });
  }
  for (const key of dropBy) {
    const kind = key.slice(0, key.indexOf(':'));
    const by = key.slice(kind.length + 1);
    merged[kind] = (merged[kind] as unknown[]).filter((rec) => recId(kind, rec) !== by);
  }
  if (problems.length > 0) return { ok: false, problems };
  const res = load(def, merged);
  return res.ok ? { ok: true, pack: res.pack, order } : { ok: false, problems: res.problems };
}
