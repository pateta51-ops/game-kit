import { validBetweenSessions, type CampaignBetweenSessions } from './between-state.ts';

export type FieldKind = 'key' | 'count' | 'set';
export interface FieldDef { id: string; kind: FieldKind; label: string; scope?: 'shared' | 'player'; cite?: string; hidden?: boolean }
export interface CountChange { step: string; key: string; before: number; after: number }
export interface LedgerEntry { step: string; label: string; amount: number; who?: string; kind?: string }
export interface SetValue { entries: string[]; crossed: string[] }
export interface CampaignLog {
  v: 1;
  recorded: string[];
  crossed: string[];
  counts: Record<string, number>;
  sets: Record<string, SetValue>;
  order: string[];
  changes: CountChange[];
  ledger: LedgerEntry[];
  betweenSessions?: CampaignBetweenSessions;
}

export const emptyLog = (): CampaignLog => ({ v: 1, recorded: [], crossed: [], counts: {}, sets: {}, order: [], changes: [], ledger: [] });

/** Storage key of a field: a per player field is stored as `who/id`. Undefined when the field is unknown or the scope does not match `who`. */
export function fieldKey(fields: readonly FieldDef[], id: string, who?: string): string | undefined {
  const f = fields.find((x) => x.id === id);
  if (!f) return undefined;
  if (f.scope === 'player') return who === undefined ? undefined : `${who}/${id}`;
  return who === undefined ? id : undefined;
}

const without = (a: readonly string[], k: string) => a.filter((x) => x !== k);

export const has = (l: CampaignLog, k: string) => l.recorded.includes(k);
export const isCrossed = (l: CampaignLog, k: string) => l.crossed.includes(k);

/** Records a key (again after a cross-out); it goes last in the order. */
export function record(l: CampaignLog, k: string): CampaignLog {
  if (has(l, k)) return l;
  return { ...l, recorded: [...l.recorded, k], crossed: without(l.crossed, k), order: [...without(l.order, k), k] };
}

/** Moves a key to the crossed-out keys and out of the order; a key never recorded is crossed out too. */
export function crossOut(l: CampaignLog, k: string): CampaignLog {
  if (isCrossed(l, k)) return l;
  return { ...l, recorded: without(l.recorded, k), crossed: [...l.crossed, k], order: without(l.order, k) };
}

/** Removes the key everywhere: keys, count (its history stays), set, order. */
export function forget(l: CampaignLog, k: string): CampaignLog {
  const counts = { ...l.counts }, sets = { ...l.sets };
  delete counts[k];
  delete sets[k];
  return { ...l, recorded: without(l.recorded, k), crossed: without(l.crossed, k), order: without(l.order, k), counts, sets };
}

export const count = (l: CampaignLog, k: string) => l.counts[k] ?? 0;

export function setCount(l: CampaignLog, k: string, value: number, step: string): CampaignLog {
  const before = count(l, k);
  if (before === value && k in l.counts) return l;
  return { ...l, counts: { ...l.counts, [k]: value }, changes: [...l.changes, { step, key: k, before, after: value }] };
}
export const addCount = (l: CampaignLog, k: string, delta: number, step: string) => setCount(l, k, count(l, k) + delta, step);

/** The (step, before, after) list of one count, oldest first. */
export const countHistory = (l: CampaignLog, k: string) => l.changes.filter((c) => c.key === k).map(({ step, before, after }) => ({ step, before, after }));

export const setOf = (l: CampaignLog, k: string): SetValue => l.sets[k] ?? { entries: [], crossed: [] };
const putSet = (l: CampaignLog, k: string, s: SetValue): CampaignLog => ({ ...l, sets: { ...l.sets, [k]: s } });

/** Adds an entry to the set; an entry crossed out earlier comes back. */
export function setInsert(l: CampaignLog, k: string, entry: string): CampaignLog {
  const s = setOf(l, k);
  if (s.entries.includes(entry)) return l;
  return putSet(l, k, { entries: [...s.entries, entry], crossed: without(s.crossed, entry) });
}
export function setCrossOut(l: CampaignLog, k: string, entry: string): CampaignLog {
  const s = setOf(l, k);
  if (s.crossed.includes(entry)) return l;
  return putSet(l, k, { entries: without(s.entries, entry), crossed: [...s.crossed, entry] });
}
export function setRemove(l: CampaignLog, k: string, entry: string): CampaignLog {
  const s = setOf(l, k);
  return putSet(l, k, { entries: without(s.entries, entry), crossed: without(s.crossed, entry) });
}
export const setHas = (l: CampaignLog, k: string, entry: string) => setOf(l, k).entries.includes(entry);

/** A reward as a ledger entry; a spend is a negative amount. */
export const reward = (l: CampaignLog, e: LedgerEntry): CampaignLog => ({ ...l, ledger: [...l.ledger, e] });

/** Ledger entries grouped by step, steps in the order they first appear. */
export function rewardsByStep(l: CampaignLog): { step: string; entries: LedgerEntry[]; total: number }[] {
  const out: { step: string; entries: LedgerEntry[]; total: number }[] = [];
  for (const e of l.ledger) {
    let g = out.find((x) => x.step === e.step);
    if (!g) out.push((g = { step: e.step, entries: [], total: 0 }));
    g.entries.push(e);
    g.total += e.amount;
  }
  return out;
}
export const rewardTotal = (l: CampaignLog, who?: string, kind?: string) =>
  l.ledger.filter((e) => (who === undefined || e.who === who) && (kind === undefined || e.kind === kind)).reduce((n, e) => n + e.amount, 0);

/** The keys to show as the paper sheet does: recorded in order, then crossed out; hidden fields left out. */
export function visibleKeys(l: CampaignLog, fields: readonly FieldDef[] = []) {
  const hidden = new Set(fields.filter((f) => f.hidden).map((f) => f.id));
  const base = (k: string) => k.slice(k.indexOf('/') + 1);
  return { recorded: l.order.filter((k) => !hidden.has(base(k))), crossed: l.crossed.filter((k) => !hidden.has(base(k))) };
}

/** Reads a stored value (a parsed save); undefined when it is not a log. Missing parts are filled, unknown parts kept. */
export function readLog(x: unknown): CampaignLog | undefined {
  if (typeof x !== 'object' || x === null) return undefined;
  const o = x as Partial<CampaignLog>;
  if (o.v !== 1 || (o.betweenSessions !== undefined && !validBetweenSessions(o.betweenSessions))) return undefined;
  return { ...emptyLog(), ...o };
}
