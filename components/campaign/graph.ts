import { addCount, crossOut, forget, isCrossed, count, has, record, reward, setCount, setCrossOut, setHas, setInsert, setRemove, type CampaignLog, type LedgerEntry } from './log.ts';
import { played, stepKey, type CampaignSave, type NextStep, type Step, type StepKind } from './steps.ts';

/** A test over the log (and, between games, the save): data, or a function for anything else. */
export type Cond =
  | { has: string } | { crossed: string } | { count: string; atLeast?: number; atMost?: number } | { inSet: string; entry: string }
  | { played: string } | { won: string } | { lost: string } | { not: Cond } | { all: Cond[] } | { any: Cond[] }
  | ((log: CampaignLog, s?: CampaignSave) => boolean);
/** A write on the log between games; `key` is a storage key (`fieldKey`). */
export type LogOp =
  | { op: 'record' | 'crossOut' | 'forget'; key: string } | { op: 'add' | 'set'; key: string; n: number }
  | { op: 'insert' | 'strike' | 'remove'; key: string; entry: string } | { op: 'reward'; entry: Omit<LedgerEntry, 'step'> };
export interface ChoiceOption { id: string; label: string; text?: string; when?: Cond; ops: LogOp[] }
/** One printed instruction with its citation; it writes the log between games (`ops`, or a player's `choose`), or is run by the game inside a game in a named window (`inGame`). */
export interface Instruction<E = unknown> { id: string; text: string; cite: string; when?: Cond; ops?: LogOp[]; choose?: ChoiceOption[]; inGame?: { window?: string; effect: E } }
export type Phase = 'setup' | 'victory' | 'defeat';
export interface GraphNode<E = unknown> { id: string; label: string; kind?: StepKind; when?: Cond; setup?: Instruction<E>[]; victory?: Instruction<E>[]; defeat?: Instruction<E>[] }
/** linear: the nodes in order (a node whose `when` fails is skipped); choice: the player picks among the available nodes, `before` runs ahead of each pick, `finale` comes when its test holds or nothing else is left; `failAfter` lost nodes end the campaign. */
export interface CampaignGraph<E = unknown> {
  kind: 'linear' | 'choice';
  nodes: GraphNode<E>[];
  before?: Instruction<E>[];
  finale?: { node: string; when?: Cond };
  failAfter?: number;
  every?: Partial<Record<Phase, Instruction<E>[]>>;
}

export const IN_GAME_WINDOW = 'afterSetup';
export const nodeStep = (n: GraphNode<unknown>): Step => ({ kind: n.kind ?? 'scenario', id: n.id });

export function holds(c: Cond | undefined, log: CampaignLog, s?: CampaignSave): boolean {
  if (!c) return true;
  if (typeof c === 'function') return c(log, s);
  if ('has' in c) return has(log, c.has);
  if ('crossed' in c) return isCrossed(log, c.crossed);
  if ('count' in c) { const n = count(log, c.count); return n >= (c.atLeast ?? -Infinity) && n <= (c.atMost ?? Infinity); }
  if ('inSet' in c) return setHas(log, c.inSet, c.entry);
  if ('not' in c) return !holds(c.not, log, s);
  if ('all' in c) return c.all.every((x) => holds(x, log, s));
  if ('any' in c) return c.any.some((x) => holds(x, log, s));
  if (!s) return false;
  const key = (id: string) => Object.keys(s.position.resolutions).find((k) => k.slice(k.indexOf(':') + 1) === id);
  if ('played' in c) return s.position.done.some((k) => k.slice(k.indexOf(':') + 1) === c.played);
  const k = key('won' in c ? c.won : c.lost);
  return k !== undefined && s.position.resolutions[k] === ('won' in c ? 'won' : 'lost');
}

const node = <E>(g: CampaignGraph<E>, id: string) => g.nodes.find((n) => n.id === id);
const losses = (g: CampaignGraph<unknown>, s: CampaignSave) => g.nodes.filter((n) => s.position.resolutions[stepKey(nodeStep(n))] === 'lost').length;

/** The nodes a player may pick now (choice graph), or the next one (linear). */
export function available<E>(g: CampaignGraph<E>, s: CampaignSave): GraphNode<E>[] {
  const open = g.nodes.filter((n) => n.id !== g.finale?.node && !played(s, nodeStep(n)) && holds(n.when, s.log, s));
  return g.kind === 'linear' ? open.slice(0, 1) : open;
}

/** The campaign's `NextStep`: the finale when due, else the first available node (a choice graph lets the player change it with `chooseNode`); null at the end or after `failAfter` lost nodes. Resolve a node with `end(..., { resolution: 'won' | 'lost' })`. */
export const graphNext = (g: CampaignGraph<unknown>): NextStep => (s) => {
  if (g.failAfter !== undefined && losses(g, s) >= g.failAfter) return null;
  const f = g.finale && node(g, g.finale.node);
  const open = available(g, s);
  if (f && !played(s, nodeStep(f)) && ((g.finale?.when && holds(g.finale.when, s.log, s)) || !open.length)) return nodeStep(f);
  return open[0] ? nodeStep(open[0]) : null;
};

/** The pick of a choice graph as one question: one option per available node. */
export const nodeChoice = (g: CampaignGraph<unknown>, s: CampaignSave) => ({ id: 'node' as const, options: available(g, s).map((n) => ({ id: n.id, label: n.label })) });
export function chooseNode(g: CampaignGraph<unknown>, s: CampaignSave, id: string): CampaignSave {
  const n = available(g, s).find((x) => x.id === id);
  if (!n) throw new Error(`campaign: node ${id} not available`);
  return { ...s, position: { ...s.position, step: nodeStep(n) } };
}

/** The instructions of one phase of a node, the graph's `every` ones after; `before` gives the graph's pre-choice ones. */
export function instructions<E>(g: CampaignGraph<E>, nodeId: string | null, phase: Phase | 'before'): Instruction<E>[] {
  if (phase === 'before') return g.before ?? [];
  const n = nodeId === null ? undefined : node(g, nodeId);
  return [...(n?.[phase] ?? []), ...(g.every?.[phase] ?? [])];
}

export function applyOp(l: CampaignLog, o: LogOp, step: string): CampaignLog {
  switch (o.op) {
    case 'record': return record(l, o.key);
    case 'crossOut': return crossOut(l, o.key);
    case 'forget': return forget(l, o.key);
    case 'add': return addCount(l, o.key, o.n, step);
    case 'set': return setCount(l, o.key, o.n, step);
    case 'insert': return setInsert(l, o.key, o.entry);
    case 'strike': return setCrossOut(l, o.key, o.entry);
    case 'remove': return setRemove(l, o.key, o.entry);
    case 'reward': return reward(l, { ...o.entry, step });
  }
}

export interface Ran { id: string; text: string; cite: string; chose?: string }
export interface InstructionAsk { id: string; text: string; cite: string; options: { id: string; label: string; text?: string }[] }
/** Runs the between-games instructions in order (in-game ones and those whose `when` fails are passed over). A `choose` without an answer stops the run: the log comes back as it was with the question in `ask`; run again with the answer added (answers by instruction id). `ran` lists the printed text of what ran. */
export function runBetween(list: readonly Instruction<unknown>[], log: CampaignLog, step: string, answers: Record<string, string> = {}, s?: CampaignSave): { log: CampaignLog; ran: Ran[]; ask?: InstructionAsk } {
  let l = log;
  const ran: Ran[] = [];
  for (const i of list) {
    if (i.inGame || !holds(i.when, l, s)) continue;
    const r: Ran = { id: i.id, text: i.text, cite: i.cite };
    for (const o of i.ops ?? []) l = applyOp(l, o, step);
    if (i.choose) {
      const opts = i.choose.filter((o) => holds(o.when, l, s));
      const pick = opts.find((o) => o.id === answers[i.id]);
      if (!pick) {
        if (opts.length) return { log, ran: [], ask: { id: i.id, text: i.text, cite: i.cite, options: opts.map((o) => ({ id: o.id, label: o.label, ...(o.text === undefined ? {} : { text: o.text }) })) } };
      } else {
        for (const o of pick.ops) l = applyOp(l, o, step);
        r.chose = pick.id;
      }
    }
    ran.push(r);
  }
  return { log: l, ran };
}

/** The in-game instructions for one window (default `afterSetup`) whose `when` holds on the game's frozen log: the game runs their effects in its own effect language. */
export const inGameAt = <E>(list: readonly Instruction<E>[], window: string, log: CampaignLog): Instruction<E>[] =>
  list.filter((i) => i.inGame && (i.inGame.window ?? IN_GAME_WINDOW) === window && holds(i.when, log));

/** Problems in a graph as data: duplicate or unknown ids, an instruction without printed text or citation, a choice with no option. */
export function checkGraph(g: CampaignGraph<unknown>): string[] {
  const out: string[] = [], ids = new Set<string>();
  for (const n of g.nodes) { if (ids.has(n.id)) out.push(`duplicate node ${n.id}`); ids.add(n.id); }
  if (g.finale && !ids.has(g.finale.node)) out.push(`unknown finale ${g.finale.node}`);
  const all = [...(g.before ?? []), ...Object.values(g.every ?? {}).flat(), ...g.nodes.flatMap((n) => [...(n.setup ?? []), ...(n.victory ?? []), ...(n.defeat ?? [])])];
  for (const i of all) {
    if (!i.text || !i.cite) out.push(`instruction ${i.id} lacks printed text or citation`);
    if (i.choose && !i.choose.length) out.push(`instruction ${i.id} has an empty choice`);
  }
  return out;
}
