// The automa (kit automa): a priority table over the legal answers, read from the seat's view (the flipped mode card is
// public), difficulty tiers as data, one Bot object per level for the store and sim-pool alike.
import type { AnswerAction } from '../../kit/engine-core/index.ts';
import { atTier, automaBot, type Automa, type AutomaBot, type AutomaTier } from '../../kit/automa/index.ts';
import { defOf, MODES, other, type Level, type Mode, type RefView } from './rules.ts';

type Knobs = { readonly big: number };
const card = (a: AnswerAction) => defOf(a.picks[0] ?? '');
export const damage = (a: AnswerAction): number => {
  const st = card(a)?.effect[0];
  return st?.op === 'hit' ? st.n : 0;
};
export const AUTOMA: Automa<Mode, RefView, AnswerAction, Knobs> = {
  cards: MODES,
  reshuffle: true,
  knobs: { big: 3 },
  table: {
    rules: [
      { id: 'finish', match: (a, v) => damage(a) >= v.life[other(v.seat)] },
      { id: 'guard', when: (v) => v.mode === 'guard', match: (a) => card(a)?.stay === true },
      { id: 'big', match: (a, _v, k) => damage(a) >= k.big },
      { id: 'yes', match: (a) => a.picks[0] === 'yes' },
    ],
    tieBreak: [(a) => damage(a)],
    fallback: () => true,
  },
};
export const TIERS: Readonly<Record<'easy' | 'hard', AutomaTier<Mode, RefView, AnswerAction, Knobs>>> = {
  easy: { name: 'easy', knobs: { big: 9 }, table: (t) => ({ ...t, rules: t.rules.filter((r) => r.id !== 'guard') }) },
  hard: { name: 'hard', knobs: { big: 2 } },
};
export const BOTS: Readonly<Record<Level, AutomaBot<RefView, AnswerAction>>> = {
  easy: automaBot('automa', atTier(AUTOMA, TIERS.easy)),
  normal: automaBot('automa', AUTOMA),
  hard: automaBot('automa', atTier(AUTOMA, TIERS.hard)),
};
