import { z } from 'zod';
import { effectTasks, verbHandler } from '../../../components/card-language/index.ts';
import { cardPack, inDryRun, type PackEnv, type PackState, type PackStep } from '../../../components/card-language/pack.ts';
import { cardsIn, newZones } from '../../../components/card-zones/index.ts';
import { load, loadText, type Source } from '../../../components/content-pack/index.ts';
import { makeChoice, mergePacks, type PackData, type Registry } from '../../../components/content-pack/expansion.ts';
import { draftOf, hashValue, seedRng, timingHandlers, type AnswerAction, type Draft, type GameRules, type KernelEvent, type KernelPrompt, type KernelState, type KernelTask } from '../../../components/engine-core/index.ts';
import { createProbe, type RanNote } from '../../../components/card-harness/index.ts';
import { runtimeCardMain, standardCardCases, type RuntimeCardSuite, type StandardCardRule } from '../../../components/card-harness/runtime.ts';

interface Printed {
  readonly id: string;
  readonly conditional?: true;
  readonly rule: StandardCardRule;
}
interface Card {
  readonly id: string;
  readonly clause: string;
  readonly effects: readonly PackStep[];
}
interface Layout {
  readonly line: string;
  readonly fuel: number;
  readonly cards: number;
}
interface G {
  readonly state: KernelState & PackState & { readonly line: string };
  readonly action: AnswerAction;
  readonly task: KernelTask;
  readonly prompt: KernelPrompt;
  readonly event: KernelEvent;
  readonly stamped: never;
  readonly options: Layout & { readonly seed: string };
  readonly rules: object;
  readonly content: readonly Card[];
}

const probe = createProbe<RanNote>();
const pack = cardPack<G, PackEnv & { readonly line: string }>({
  offer: { cost: 'whole' },
  handlers: () => rules.handlers,
  custom: { whistle: { run: ctx => { draftOf(ctx).res = { you: { fuel: fuel(ctx.s) + 1 } }; }, text: () => 'Whistle for one fuel.' } },
});
const runVerb = verbHandler<G>(pack.verbs);
const fuel = (s: G['state']): number => s.res?.['you']?.['fuel'] ?? 0;
const rules: GameRules<G> = {
  handlers: {
    ...timingHandlers<G>({ happen: (ctx, o) => { pack.happen(ctx, o); } }),
    inspect(ctx) {
      const line = ctx.s.line;
      const card = ctx.content.find(r => r.clause === line);
      probe.note({ kind: 'clause-attempt', id: line });
      const enabled = card !== undefined && pack.judge(ctx.s, ctx.content, card.effects, { seat: 'you', line }).answer !== 'no';
      ctx.ask({ min: 1, max: 1, options: [{ id: line, enabled }, { id: 'pass', enabled: true }] }, { kind: 'resolve' });
    },
    resolve(ctx, task) {
      const card = ctx.content.find(r => r.clause === task.answer?.[0]);
      if (card !== undefined) ctx.then(...effectTasks(card.effects, { seat: 'you', line: card.clause }));
    },
    verb(ctx, task) {
      runVerb(ctx, task);
      const line = (task as KernelTask & { readonly env?: { readonly line?: string } }).env?.line;
      if (line !== undefined && !inDryRun()) probe.note({ kind: 'clause', id: line });
    },
  },
  blank({ fuel, cards, line, seed }) {
    const [a, b, c, d] = seedRng(seed);
    return {
      line, rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [],
      res: { you: { fuel } },
      zones: newZones({
        'deck:you': { owner: 'you', seen: 'count', cards: Array.from({ length: cards }, (_, i) => 'chip-' + String(i)) },
        'hand:you': { owner: 'you', seen: 'owner' },
      }) as Draft<G['state']['zones']>,
    };
  },
  setup(ctx) {
    ctx.ask({ min: 1, max: 1, options: [{ id: 'inspect', enabled: true }] }, { kind: 'inspect' });
  },
  contentHash: hashValue,
};

const def = {
  kinds: { card: { schema: z.strictObject({ id: z.string(), clause: z.string(), effects: z.array(z.unknown()) }), effects: ['effects'] } },
  verbs: pack.verbs,
};

export const printed: readonly Printed[] = [
  { id: 'spark.1', rule: { kind: 'gain', meter: 'fuel', amount: 2 } },
  { id: 'scoop.1', rule: { kind: 'draw', deck: 'deck', hand: 'hand', count: 2 } },
  { id: 'pump.1', conditional: true, rule: { kind: 'paid-draw', meter: 'fuel', cost: 2, deck: 'deck', hand: 'hand', count: 1 } },
];
export const extraPrint: Printed = { id: 'late.1', rule: { kind: 'gain', meter: 'fuel', amount: 3 } };
export const baseCards: readonly Card[] = [
  { id: 'spark', clause: 'spark.1', effects: [{ op: 'gainResource', res: 'fuel', amount: 2 }] },
  { id: 'scoop', clause: 'scoop.1', effects: [{ op: 'draw', count: 2 }] },
  { id: 'pump', clause: 'pump.1', effects: [{ op: 'payThen', cost: [{ op: 'pay', res: 'fuel', amount: 2 }], then: [{ op: 'draw', count: 1 }] }] },
];
const expansion: readonly Card[] = [{ id: 'late', clause: 'late.1', effects: [{ op: 'gainResource', res: 'fuel', amount: 3 }] }];
const registry: Registry = [{ id: 'first', name: 'First', kind: 'base' }, { id: 'second', name: 'Second', kind: 'expansion', dependsOn: ['first'] }];

export function currentPack(base: readonly unknown[], extra = false): readonly Card[] {
  const files: Readonly<Record<string, Source>> = { card: { json: JSON.stringify(base) } };
  const loaded = loadText(def, files);
  if (!loaded.ok) throw new Error(loaded.problems.join('\n'));
  const packs: PackData[] = [{ id: 'first', data: loaded.pack.records }, { id: 'second', data: { card: expansion } }];
  const selected = mergePacks(def, registry, packs, makeChoice('first', extra ? ['second'] : []));
  if (!selected.ok) throw new Error(selected.problems.join('\n'));
  return selected.pack.records['card'] as readonly Card[]; // The same Zod and verb schemas verified the chosen pack.
}

export function suite(records: readonly Card[], clauses = printed): RuntimeCardSuite<Printed, Card, Layout, G> {
  return {
    records, clauses, lineOf: r => r.clause,
    familyOf: (_clause, group) => {
      const effects = group.length === 1 ? group[0]?.effects : undefined;
      const step = effects?.length === 1 ? effects[0] : undefined;
      if (step?.op === 'payThen' && (step.cost.length !== 1 || step.cost[0]?.op !== 'pay' || step.then.length !== 1 || step.then[0]?.op !== 'draw'))
        return undefined;
      return step?.op;
    },
    families: {
      gainResource: cases,
      draw: cases,
      payThen: cases,
    },
    start: (layout, content) => ({ rules, content, setup: {}, options: { ...layout, seed: 'crank' }, probe }),
    observe: (state) => ({ fuel: fuel(state), hand: cardsIn(state, 'hand:you').length, deck: cardsIn(state, 'deck:you').length }),
  };
}

function cases(clause: Printed) {
  return standardCardCases(clause.rule, ({ path, cards, balance }) => ({
    layout: { line: clause.id, fuel: balance ?? 1, cards: cards ?? 1 },
    answers: [['inspect'], [path === 'resolve' ? clause.id : 'pass']],
    optionId: clause.id,
  }));
}

export function validateRecords(records: readonly Card[]): string[] {
  const result = load(def, { card: records });
  return result.ok ? [] : result.problems;
}

if (process.argv[1] === import.meta.filename) {
  const content = [
    process.argv.includes('--invalid')
      ? { ...baseCards[0], effects: [{ op: 'doesNotExist' }] }
      : { ...baseCards[0], effects: [{ op: 'gainResource', res: 'fuel', amount: process.argv.includes('--bad') ? 3 : 2 }] },
    ...baseCards.slice(1),
  ];
  try {
    process.exitCode = runtimeCardMain(suite(currentPack(content, true), [...printed, extraPrint]), console.log);
  } catch (error) {
    console.log(String(error));
    process.exitCode = 1;
  }
}
