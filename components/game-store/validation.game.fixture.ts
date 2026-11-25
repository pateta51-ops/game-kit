import { appendFileSync } from 'node:fs';
import { draftOf, type AnswerAction, type DebugAction } from '../engine-core/index.ts';
import { CONTENT, COUNTER, RULES, type Counter } from '../engine-core/fake/counter.ts';
import { bySeat, randomDriver } from '../sim-pool/index.ts';
import type { GameDef } from './index.ts';
import { botDriverOf, simGameOf } from './sim.ts';

type Seat = 'a' | 'b';
const secrets = { a: 'ONLY_A', b: 'ONLY_B' };
const mode = process.env.PROBE_MODE;
function event(entry: unknown): void {
  if (process.env.PROBE_EVENTS) appendFileSync(process.env.PROBE_EVENTS, `${JSON.stringify(entry)}\n`);
}
const definition: GameDef<Counter, string, Seat> = {
  rules: {
    ...COUNTER,
    debug: {},
    handlers: {
      turn(ctx) {
        const state = draftOf(ctx);
        if (state.turn === 3) { state.result = { kind: 'won' }; return; }
        state.turn += 1;
        ctx.ask({
          seat: state.turn === 2 ? 'b' : 'a', min: 1, max: 1,
          options: [{ id: 'one', enabled: true }, { id: 'two', enabled: true }],
        }, { kind: 'chosen' });
      },
      chosen(ctx) { ctx.then({ kind: 'turn' }); },
    },
    setup(ctx) { ctx.then({ kind: 'turn' }); },
  },
  content: CONTENT,
  seats: ['a', 'b'],
  start(seed) { event(['setup', seed]); return { options: { seed }, rules: RULES }; },
  view(state, seat, ctx) {
    event(['view', state.turn, seat, ctx ?? null]);
    return (mode === 'context-leak' || mode === 'generic') && seat === 'b' && ctx === undefined ? secrets.a : secrets[seat];
  },
  opponent(view, prompt, rng) {
    const draw = rng.int(2);
    const pick = prompt.seat === 'b' ? (view === secrets.a ? 'two' : 'one') : draw === 0 ? 'one' : 'two';
    event(['decision', prompt.seat, draw, pick]);
    return [pick];
  },
};
const unnamed = bySeat<Counter>({}, randomDriver<Counter>());
const bot = botDriverOf(definition, {
  name: 'public-bot',
  choose(view, answers, rng) {
    const draw = rng.int(2);
    const choice = answers[view === secrets.a ? draw : 0] as AnswerAction;
    event(['decision', 'bot', draw, choice.picks[0]]);
    return choice;
  },
});
const decorated = {
  ...bot,
  choose: (_state: Counter['state'], answers: readonly AnswerAction[]) => {
    event(['decorated']);
    return answers.at(-1) as AnswerAction;
  },
};
const game = simGameOf(definition, {
  drivers: { bot, decorated, grouped: unnamed, wrapped: bySeat<Counter>({ a: bot, b: bot }),
    delegated: { name: 'delegate', reasons: () => [], choose(state, answers, rng) {
      try { return bot.choose(state, answers, rng); }
      catch { event(['fallback']); return answers[0] as AnswerAction; }
    } },
  },
  aliases: { alias: 'opponent', unnamed: 'grouped' },
  viewValidation: {
    ...(mode === 'subset' ? { seats: ['b'] as const } : {}),
    secrets: (_state, seat) => { event(['assertion', seat]); return [secrets[seat === 'a' ? 'b' : 'a']]; },
  },
});
const generic = { ...game };
delete generic.driverViewAssertions;
export const simGame = {
  ...(mode === 'generic' ? generic : game),
  content() { event(['content']); return game.content(); },
  validateDriver(name: string) {
    event(['registration', name]);
    if (mode === 'runtime-preflight') throw Object.assign(new Error('unrelated preflight failure'), { name: 'DriverRegistrationError' });
    return game.validateDriver?.(name);
  },
  ...(mode === 'legacy' ? {
    view: () => 'legacy',
    secrets: () => ['ONLY_B'],
  } : {}),
  randomDebug: (): DebugAction => ({ kind: 'debug', verb: 'set', args: { path: ['counter'], value: 0 } }),
  summary: (_state: Counter['state'], actions: readonly (AnswerAction | DebugAction)[]) => actions,
};
