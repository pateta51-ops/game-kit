import { isDeepStrictEqual } from 'node:util';
import { draftOf } from '../kit/engine-core/index.ts';
import { legalAnswers, playOne, type SimGame, type SimRecord } from '../kit/sim-pool/index.ts';
import { CONTENT, other, viewOf, type Ref, type RefState, type Seat } from '../src/engine/rules.ts';
import { simGame } from '../src/engine/sim.ts';

export type HiddenControl = 'normal' | 'hidden-policy' | 'hidden-answers' | 'hidden-no-variation' | 'hidden-missing' | 'hidden-truncated' | 'hidden-error' | 'hidden-empty';
const inventory = (state: RefState): string[] => Object.values(state.zones).flatMap(zone => zone.cards).sort();
const hiddenFacts = (state: RefState, seat: Seat): string[] =>
  [...(state.zones.deck?.cards ?? []), ...(state.zones[`hand:${other(seat)}`]?.cards ?? [])].map(card => CONTENT.cards[card] ?? '');

function pairProblems(state: RefState, alternate: RefState, seat: Seat): string[] {
  const problems: string[] = [];
  if (!isDeepStrictEqual(inventory(state), inventory(alternate))) problems.push('physical inventory changed');
  if (!isDeepStrictEqual(viewOf(state, seat), viewOf(alternate, seat))) problems.push('entitled observation changed');
  const { zones: _liveZones, ...live } = state;
  const { zones: _otherZones, ...changed } = alternate;
  if (!isDeepStrictEqual(live, changed)) problems.push('public history, prompt, pending work or RNG changed');
  for (const [key, zone] of Object.entries(state.zones)) {
    const candidate = alternate.zones[key];
    if (key === 'deck' || key === `hand:${other(seat)}`) {
      if (!isDeepStrictEqual({ ...zone, cards: [] }, { ...candidate, cards: [] }) || zone.cards.length !== candidate?.cards.length)
        problems.push(`hidden zone metadata/count changed: ${key}`);
    } else if (!isDeepStrictEqual(zone, candidate)) problems.push(`known zone changed: ${key}`);
  }
  return problems;
}

function withMend(game: SimGame<Ref>): SimGame<Ref> {
  const cards = Object.keys(CONTENT.cards);
  const mend = cards.find(card => CONTENT.cards[card] === 'mend')!;
  const first = cards.find(card => card !== mend)!;
  const second = cards.find(card => CONTENT.cards[card] !== CONTENT.cards[first] && CONTENT.cards[card] !== 'mend')!;
  const deal = [mend, ...cards.filter(card => ![mend, first, second].includes(card)), first, second];
  return {
    ...game,
    rules: { ...game.rules, setup(ctx) {
      game.rules.setup?.(ctx);
      const state = draftOf(ctx);
      state.zones['hand:0']!.cards = deal.slice(0, CONTENT.hand);
      state.zones['hand:1']!.cards = deal.slice(CONTENT.hand, 2 * CONTENT.hand);
      state.zones.deck!.cards = deal.slice(2 * CONTENT.hand);
    } },
    driver(name, spec, content) {
      const driver = game.driver(name, spec, content);
      return { ...driver, choose(state, answers, rng) {
        const pick = state.flow?.phase === 'draw' ? 'no' : state.prompt?.kind === 'pick' && state.prompt.seat === '0' ? mend : undefined;
        return answers.find(answer => answer.picks.includes(pick ?? '')) ?? driver.choose(state, answers, rng);
      } };
    },
  };
}

export function hiddenAcceptance(control: HiddenControl = 'normal') {
  const problems: string[] = [];
  const shapes = new Set<string>();
  const seats = new Set<string>();
  const records: (SimRecord & { paired: number; varied: number })[] = [];
  const run = (driver: string, index: number, scenario = false) => {
      const seed = scenario ? 'paired-mend' : `paired-${String(index)}`;
      let paired = 0, varied = 0;
      const candidate: SimGame<Ref> = {
        ...simGame,
        reshuffleHidden(state, seat, rng) {
          paired++;
          const who = String(seat) as Seat;
          const alternate = control === 'hidden-no-variation' ? state : simGame.reshuffleHidden(state, seat, rng);
          const issues = pairProblems(state, alternate, who);
          if (issues.length) throw new Error(issues.join('; '));
          if (!isDeepStrictEqual(hiddenFacts(state, who), hiddenFacts(alternate, who))) varied++;
          const task = state.stack.at(-1) as { readonly env?: { readonly triggered?: boolean } } | undefined;
          shapes.add(state.prompt?.kind === 'pick' ? 'pick' : task?.env?.triggered ? 'may:heal' : 'may:draw');
          seats.add(who);
          return alternate;
        },
      };
      let game = scenario ? withMend(candidate) : candidate;
      if (control === 'hidden-policy') game = { ...candidate, driver: () => ({
        name: 'hidden-policy', reasons: () => [],
        choose: (state, answers) => answers[Number((state.zones.deck?.cards[0] ?? 'c0').slice(1)) % answers.length]!,
      }) };
      if (control === 'hidden-answers') game = { ...candidate, answers: (state, _content, rng) =>
        legalAnswers(state.prompt!, rng).map(answer => ({ ...answer, hidden: state.zones.deck?.cards[0] ?? '' })),
      };
      if (control === 'hidden-missing') { const without = { ...candidate }; delete without.reshuffleHidden; game = without; }
      if (control === 'hidden-truncated') game = { ...candidate, maxActions: 1 };
      if (control === 'hidden-error') game = { ...candidate, reshuffleHidden: () => { throw new Error('deliberate alternate-world failure'); } };
      const record = playOne(game, CONTENT, { index, seed, driver }, undefined, { hidden: true, view: true });
      if (record.error !== undefined) problems.push(`${seed}/${driver}: ${record.error}`);
      if (record.violations?.length) problems.push(`${seed}/${driver}: invariant violations: ${JSON.stringify(record.violations)}`);
      if (record.result === null || record.actions === 0) problems.push(`${seed}/${driver}: no completed decision trace`);
      if (!paired || !varied) problems.push(`${seed}/${driver}: insufficient paired hidden variation (${String(varied)}/${String(paired)})`);
      records.push({ ...record, paired, varied });
  };
  if (control !== 'hidden-empty') for (const driver of ['opponent', 'random', 'automa']) for (let index = 0; index < 4; index++) run(driver, index);
  if (control === 'normal' && !shapes.has('may:heal')) run('opponent', 4, true);
  for (const shape of ['pick', 'may:draw', 'may:heal']) if (!shapes.has(shape)) problems.push(`unexecuted prompt shape: ${shape}`);
  for (const seat of ['0', '1']) if (!seats.has(seat)) problems.push(`unexecuted deciding seat: ${seat}`);
  return {
    scope: 'same-observation hidden redistribution; matched-seed legal answer payloads and pure policy choices',
    limitations: ['The three registered policies choose without prior-call memory. Stateful policy histories are not certified.',
      'Only unseen deck/opponent-hand allocation varies; public cards and remembered public history remain fixed.'],
    shapes: [...shapes].sort(), seats: [...seats].sort(), records, problems,
  };
}
