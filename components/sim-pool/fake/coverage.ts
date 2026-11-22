// K651: the fake counter whose answer handler resolves clauses: `add` or `draw` (each moves the counter), `noop` on every
// answer (moves nothing itself, in the same action as `add` or `draw`), `rare` only when the game's settings say
// `steer: 'rare'`; `never` is resolved by no game. The trace gives each effect's state before and after (`effects`), except
// for `rare`, which is judged over the whole action. Settings `crash: true` throw once the counter reaches 5.
import { CONTENT, COUNTER, RULES, type Counter, type CounterTask } from '../../engine-core/fake/counter.ts';
import { draftOf, type Ctx } from '../../engine-core/index.ts';
import { randomDriver, type SimGame } from '../index.ts';

const resolved = new Set<string>();
const effects: { clause: string; before: unknown; after: unknown }[] = [];
const trace = { resolved, effects, clear: () => void (resolved.clear(), (effects.length = 0)) };
type Rules = Counter['rules'] & { steer?: string; crash?: boolean };
const chosen = COUNTER.handlers.chosen as (ctx: Ctx<Counter>, task: CounterTask) => void;
const copy = (s: unknown): unknown => JSON.parse(JSON.stringify(s));

export const simGame: SimGame<Counter> = {
  rules: {
    ...COUNTER,
    handlers: {
      ...COUNTER.handlers,
      chosen(ctx, task) {
        const s = draftOf(ctx);
        const r = s.rules as Rules;
        if (r.crash === true && s.counter >= 5) throw new Error('crash at 5');
        const now = copy(s);
        resolved.add('noop');
        effects.push({ clause: 'noop', before: now, after: now });
        const clause = task.answer?.[0] === 'add' ? 'add' : 'draw';
        resolved.add(clause);
        chosen(ctx, task);
        effects.push({ clause, before: now, after: copy(s) });
        if (r.steer === 'rare') resolved.add('rare');
      },
    },
  },
  content: () => CONTENT,
  start: (spec) => ({ options: { seed: spec.seed }, rules: { target: RULES.target, steer: spec.settings?.steer, crash: spec.settings?.crash } as Rules }),
  driver: () => randomDriver<Counter>(),
  trace: () => trace,
};

/** The same game with the did-something hook: a resolve counts only when the counter moved. */
export const checked: SimGame<Counter> = { ...simGame, changed: (_clause, before, after) => before.counter !== after.counter };
/** The same game with the hook and no effect entries: every resolve is judged over its whole action. */
export const perAction: SimGame<Counter> = { ...checked, trace: () => ({ resolved, clear: trace.clear }) };
