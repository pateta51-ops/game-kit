// K651: the fake counter whose answer handler resolves clauses: `add` or `draw` (each changes the state), `noop` on every
// answer (changes nothing), `rare` only when the game's settings say `steer: 'rare'`; `never` is resolved by no game.
// Settings `crash: true` throw once the counter reaches 5 (a failure that only those settings show).
import { CONTENT, COUNTER, RULES, type Counter, type CounterTask } from '../../engine-core/fake/counter.ts';
import { draftOf, type Ctx } from '../../engine-core/index.ts';
import { randomDriver, type SimGame } from '../index.ts';

const resolved = new Set<string>();
const trace = { resolved, clear: () => resolved.clear() };
type Rules = Counter['rules'] & { steer?: string; crash?: boolean };
const chosen = COUNTER.handlers.chosen as (ctx: Ctx<Counter>, task: CounterTask) => void;

export const simGame: SimGame<Counter> = {
  rules: {
    ...COUNTER,
    handlers: {
      ...COUNTER.handlers,
      chosen(ctx, task) {
        const s = draftOf(ctx);
        const r = s.rules as Rules;
        if (r.crash === true && s.counter >= 5) throw new Error('crash at 5');
        resolved.add(task.answer?.[0] === 'add' ? 'add' : 'draw');
        resolved.add('noop');
        if (r.steer === 'rare') resolved.add('rare');
        chosen(ctx, task);
      },
    },
  },
  content: () => CONTENT,
  start: (spec) => ({ options: { seed: spec.seed }, rules: { target: RULES.target, steer: spec.settings?.steer, crash: spec.settings?.crash } as Rules }),
  driver: () => randomDriver<Counter>(),
  trace: () => trace,
};

const part: Record<string, (s: Counter['state']) => unknown> = { add: (s) => s.marks.added.length, draw: (s) => s.pile.length, noop: (s) => s.rules.target, rare: (s) => s.counter };
/** The same game with the did-something hook: a resolve counts only when the part of the state its clause moves did move. */
export const checked: SimGame<Counter> = { ...simGame, changed: (clause, before, after) => part[clause]?.(before) !== part[clause]?.(after) };
