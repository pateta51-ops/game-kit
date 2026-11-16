import { count, emptyLog, fieldKey, record, setCount, setInsert, setOf, type CampaignLog, type FieldDef } from './log.ts';
import { detour, newCampaign, stepKey, type CampaignSave, type Step, type StepKind } from './steps.ts';

/** An extra thing the game lets a player do between scenarios (an upgrade, a side scenario); `when` hides it. */
export interface BetweenAction { id: string; label: string; kind: StepKind; step: string; when?: (s: CampaignSave) => boolean }
export interface BetweenOption { id: string; label?: string; action?: BetweenAction }
/** The between-scenarios screen as one engine question: the next step and what can be chosen. */
export interface BetweenQuestion { id: 'between'; next: Step | null; options: BetweenOption[] }

export function betweenQuestion(s: CampaignSave, actions: readonly BetweenAction[] = []): BetweenQuestion {
  const options: BetweenOption[] = actions.filter((a) => !a.when || a.when(s)).map((a) => ({ id: a.id, label: a.label, action: a }));
  if (s.position.step) options.unshift({ id: 'continue' });
  return { id: 'between', next: s.position.step, options };
}
/** The answer: `continue` leaves the save as it is (the game then calls `begin`); an action detours and comes back. */
export function answerBetween(s: CampaignSave, optionId: string, q: BetweenQuestion): CampaignSave {
  const o = q.options.find((x) => x.id === optionId);
  if (!o) throw new Error(`campaign: no option ${optionId}`);
  return o.action ? detour(s, o.action.kind, o.action.step) : s;
}

export interface LogSection { id: string; label: string; cite?: string; who?: string; kind: FieldDef['kind']; recorded?: boolean; crossed?: boolean; value?: number; entries?: string[]; struck?: string[] }
/** The log as the paper sheet lists it: one section per declared field in the game's order (a per player field once per player); hidden fields left out. */
export function logSections(l: CampaignLog, fields: readonly FieldDef[], players: readonly string[] = []): LogSection[] {
  const out: LogSection[] = [];
  for (const f of fields) {
    if (f.hidden) continue;
    for (const who of f.scope === 'player' ? players : [undefined]) {
      const k = fieldKey(fields, f.id, who);
      if (k === undefined) continue;
      const b: LogSection = { id: k, label: f.label, kind: f.kind, ...(f.cite ? { cite: f.cite } : {}), ...(who === undefined ? {} : { who }) };
      if (f.kind === 'key') { b.recorded = l.recorded.includes(k); b.crossed = l.crossed.includes(k); }
      else if (f.kind === 'count') b.value = count(l, k);
      else { const v = setOf(l, k); b.entries = v.entries; b.struck = v.crossed; }
      out.push(b);
    }
  }
  return out;
}

export interface ChangeRow { kind: 'count' | 'reward'; label: string; delta: number; text: string }
export interface ChangeWords { spent?: string; earned?: string }
/** What one step changed, a row per instruction: a reward "spent 4" / "earned 3", a count "5 -> 8". Count labels come from `fields`. */
export function changeRows(l: CampaignLog, step: string, fields: readonly FieldDef[] = [], w: ChangeWords = {}): ChangeRow[] {
  const name = (k: string) => fields.find((f) => f.id === k.slice(k.indexOf('/') + 1))?.label ?? k;
  const rows: ChangeRow[] = [];
  for (const c of l.changes) if (c.step === step) rows.push({ kind: 'count', label: name(c.key), delta: c.after - c.before, text: `${c.before} -> ${c.after}` });
  for (const e of l.ledger) if (e.step === step) rows.push({ kind: 'reward', label: e.label, delta: e.amount, text: `${e.amount < 0 ? w.spent ?? 'spent' : w.earned ?? 'earned'} ${Math.abs(e.amount)}` });
  return rows;
}

/** An automated setup step as a plain sentence; it shows when `when` holds (always if absent). */
export interface HandledStep { id: string; say: string | ((l: CampaignLog) => string); when?: (l: CampaignLog) => boolean }
export const handledList = (steps: readonly HandledStep[], l: CampaignLog): { id: string; text: string }[] =>
  steps.filter((s) => !s.when || s.when(l)).map((s) => ({ id: s.id, text: typeof s.say === 'string' ? s.say : s.say(l) }));

/** One question of the "start anywhere" form: it fills a declared field (`who` for a per player one). */
export interface StartQuestion { id: string; field: string; label?: string; who?: string; min?: number; max?: number; options?: string[] }
export type StartAnswer = boolean | number | string[];
/** Start at any step of the list with a chosen history: earlier steps count as played, the log is filled from the answers. */
export function startAt(o: { id: string; version: string; steps: readonly Step[]; at: Step; fields: readonly FieldDef[]; form: readonly StartQuestion[]; answers: Record<string, StartAnswer | undefined>; seed: number }): CampaignSave {
  const i = o.steps.findIndex((x) => stepKey(x) === stepKey(o.at));
  if (i < 0) throw new Error('campaign: unknown start step');
  let log = emptyLog();
  for (const q of o.form) {
    const a = o.answers[q.id], k = fieldKey(o.fields, q.field, q.who), f = o.fields.find((x) => x.id === q.field);
    if (a === undefined || k === undefined || !f) continue;
    if (f.kind === 'key' && a === true) log = record(log, k);
    else if (f.kind === 'count' && typeof a === 'number') log = setCount(log, k, a, 'start');
    else if (f.kind === 'set' && Array.isArray(a)) for (const e of a) log = setInsert(log, k, e);
  }
  const s = newCampaign(o.id, o.version, o.at, o.seed, log);
  return { ...s, position: { ...s.position, done: o.steps.slice(0, i).map(stepKey) } };
}
