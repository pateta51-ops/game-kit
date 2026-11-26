import { applyAction, createGame, draftOf, hashValue, seedRng, type AnswerAction, type GameRules, type KernelEvent, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index.ts';
import { contentGate, runClauseMutations, type ClauseMutation, type SpecGame, type SpecRow } from './index.ts';

type ScoreCard = { line: string; comparison: 'atLeast' | 'moreThan'; threshold: number; award: number };
type Layout = { charge: number; score: number };
type ScoreGame = {
  state: KernelState & Layout;
  action: AnswerAction;
  task: KernelTask;
  prompt: KernelPrompt;
  event: KernelEvent;
  stamped: never;
  options: Layout & { seed: string };
  rules: undefined;
  content: readonly ScoreCard[];
};

const rules: GameRules<ScoreGame> = {
  blank({ seed, charge, score }) {
    const [a, b, c, d] = seedRng(seed);
    return { charge, score, rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
  },
  contentHash: hashValue,
  setup(ctx) {
    ctx.ask({ min: 1, max: 1, options: [{ id: 'play', enabled: true }] }, { kind: 'resolveCard' });
  },
  handlers: {
    resolveCard(ctx) {
      const state = draftOf(ctx);
      for (const card of ctx.content) {
        const applies = card.comparison === 'atLeast' ? state.charge >= card.threshold : state.charge > card.threshold;
        if (!applies) continue;
        const score = state.score + card.award;
        if (!Number.isSafeInteger(score)) throw new RangeError('score exceeds safe integer range');
        state.score = score;
      }
    },
  },
};

const game: SpecGame<ScoreCard, Layout, 'play', number, number> = {
  records: [{ line: 'CARD-SCORE', comparison: 'atLeast', threshold: 2, award: 2 }],
  play(layout, act, records) {
    const { state } = createGame(rules, { ...layout, seed: 'score-card' }, undefined, records);
    if (!state.prompt) throw new Error('expected the play prompt');
    return applyAction(rules, state, { kind: 'answer', promptId: state.prompt.id, picks: [act] }, records).state.score;
  },
  check: (score, want) => score === want ? undefined : `expected score ${String(want)}, got ${String(score)}`,
};

// Expectations come from reading the printed rule and stay fixed for every mutant.
const rows: readonly SpecRow<Layout, 'play', number>[] = [
  { line: 'CARD-SCORE', name: 'enough charge', layout: { charge: 2, score: 1 }, act: 'play', expect: 3 },
  { line: 'CARD-SCORE', name: 'below the threshold', layout: { charge: 1, score: 1 }, act: 'play', expect: 1 },
];

const mutations: ClauseMutation<ScoreCard>[] = [
  { id: 'award-too-many', line: 'CARD-SCORE', recordIndex: 0, mutate: card => ({ ...card, award: 3 }) },
  { id: 'qualify-too-early', line: 'CARD-SCORE', recordIndex: 0, mutate: card => ({ ...card, threshold: 1 }) },
];

// Copy this catalogue from the printed clauses, independently of the implementation records.
const controls = process.argv.includes('--controls');
const printed = {
  'CARD-SCORE': 'With at least two charge, gain two points.',
  'CARD-REFERENCE': 'The score appears beside the charge counter.',
  ...(controls ? { 'CARD-MISSING': 'At the end of the turn, clear your charge.' } : {}),
};
if (controls) {
  mutations.push(
    { id: 'equivalent-condition', line: 'CARD-SCORE', recordIndex: 0, mutate: card => ({ ...card, comparison: 'moreThan', threshold: 1 }) },
    { id: 'negative-award', line: 'CARD-SCORE', recordIndex: 0, mutate: card => ({ ...card, award: -1 }) },
    { id: 'oversized-award', line: 'CARD-SCORE', recordIndex: 0, mutate: card => ({ ...card, award: Number.MAX_SAFE_INTEGER }) },
  );
}

const report = runClauseMutations(game, rows, mutations, {
  requiredLines: Object.keys(printed),
  exempt: { 'CARD-REFERENCE': 'Describes the display and has no gameplay effect.' },
  validate: records => records.flatMap(card => {
    const problems: string[] = [];
    if (card.comparison !== 'atLeast' && card.comparison !== 'moreThan') problems.push('unknown comparison');
    if (!Number.isSafeInteger(card.threshold) || card.threshold < 0) problems.push('threshold must be a nonnegative safe integer');
    if (!Number.isSafeInteger(card.award) || card.award < 0) problems.push('award must be a nonnegative safe integer');
    return problems;
  }),
});

for (const { id, status } of report.results) console.log(`${id}: ${status}`);
for (const line of report.missing) console.log(`${line}: missing`);
for (const { line, reason } of report.exempted) console.log(`${line}: exempt (${reason})`);

const gate = contentGate({
  readGenerated: () => undefined,
  packs: [{ path: 'semantic mutations', validate: () => report.problems.map(message => ({ code: 'mutation', severity: 'error', message })) }],
});
process.exitCode = gate.failed ? 1 : 0;
