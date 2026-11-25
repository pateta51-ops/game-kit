import { draftOf, would, type GameRules } from '../../engine-core/index.ts';
import { HIT, timedGame, type Timed } from '../../engine-core/fake/timed.ts';
import type { SimGame } from '../index.ts';

const handlers = {
  chosen(ctx) {
    ctx.then({ kind: 'timing.triggers' }, { kind: 'again' });
    would(ctx, [HIT]);
  },
  again(ctx) {
    ctx.ask({ min: 1, max: 1, options: [{ id: 'finish', enabled: true }], seat: 'p1' }, { kind: 'finish' });
  },
  finish(ctx) { draftOf(ctx).result = { hp: ctx.s.hp }; },
} satisfies GameRules<Timed>['handlers'];

const rules = timedGame({
  triggerCap: 1,
  triggersFor: () => ['one', 'two'].map((ability) => ({ ability, source: 'tile', player: 'p1' })),
}, handlers);

export const simGame: SimGame<Timed> = {
  rules,
  content: () => null,
  start: ({ seed }) => ({ options: { seed }, rules: { items: [HIT] } }),
  driver: () => ({
    name: 'random',
    choose: (_s, answers) => answers[0]!,
    reasons: () => [],
  }),
};
