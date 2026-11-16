// A tiny fake game for the harness tests: three dice, a hand and a table. Playing a card scores its gain when the dice
// show its pattern; a card with `discard` then discards another hand card (asked, or forced when only one is legal).
import { draftOf, hashValue, seedRng, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState } from '../../engine-core/index.ts';
import { createProbe } from '../probe.ts';
import type { ScenarioGame } from '../scenario.ts';

export type Pattern = 'pair' | 'run' | 'any';
export interface DiceCard {
  readonly id: string;
  readonly needs: Pattern;
  readonly gain: number;
  readonly discard?: boolean;
}
export interface DiceTask {
  readonly kind: string;
  readonly card?: string;
  readonly answer?: readonly string[];
}
export type DiceEvent =
  | { readonly type: 'scored'; readonly card: string; readonly n: number; readonly seq: number }
  | { readonly type: 'discarded'; readonly card: string; readonly seq: number };
export interface DiceState extends KernelState {
  readonly dice: readonly number[];
  readonly hand: readonly string[];
  readonly table: readonly string[];
  readonly defs: Readonly<Record<string, string>>;
  readonly next: number;
  readonly score: number;
  readonly stack: readonly DiceTask[];
  readonly log: readonly DiceEvent[];
}
export interface Dice {
  readonly state: DiceState;
  readonly action: AnswerAction;
  readonly task: DiceTask;
  readonly prompt: KernelPrompt;
  readonly event: DiceEvent;
  readonly stamped: never;
  readonly content: Readonly<Record<string, DiceCard>>;
  readonly options: { readonly seed: string };
  readonly rules: null;
}
export interface Note {
  readonly how: 'forced' | 'asked';
  readonly legal: readonly string[];
  readonly took?: string;
}

export const CARDS: Dice['content'] = {
  twin: { id: 'twin', needs: 'pair', gain: 2 },
  ladder: { id: 'ladder', needs: 'run', gain: 3, discard: true },
  plain: { id: 'plain', needs: 'any', gain: 1 },
};
export const PROBE = createProbe<Note>();

const shows = (p: Pattern, d: readonly number[]): boolean => {
  const s = [...d].sort();
  if (p === 'pair') return new Set(s).size < s.length;
  if (p === 'run') return s.every((x, i) => i === 0 || x === (s[i - 1] ?? 0) + 1);
  return true;
};

const discard = (s: Draft<DiceState>, ctx: Ctx<Dice>, card: string): void => {
  s.hand = s.hand.filter((c) => c !== card);
  ctx.emit({ type: 'discarded', card });
};

export const DICE: GameRules<Dice> = {
  handlers: {
    play(ctx, task) {
      const s = draftOf(ctx);
      const card = task.card ?? '';
      const def = ctx.content[s.defs[card] ?? ''];
      if (def === undefined) return;
      s.hand = s.hand.filter((c) => c !== card);
      s.table = [...s.table, card];
      if (shows(def.needs, s.dice)) {
        s.score += def.gain;
        ctx.emit({ type: 'scored', card, n: def.gain });
      }
      if (def.discard !== true || s.hand.length === 0) return;
      if (s.hand.length === 1) {
        PROBE.note(() => ({ how: 'forced', legal: [...s.hand], took: s.hand[0] as string }));
        return discard(s, ctx, s.hand[0] as string);
      }
      PROBE.note(() => ({ how: 'asked', legal: [...s.hand] }));
      ctx.then({ kind: 'discard' });
      ctx.ask({ min: 1, max: 1, options: s.hand.map((id) => ({ id, enabled: true })) });
    },
    discard(ctx, task) {
      discard(draftOf(ctx), ctx, task.answer?.[0] ?? '');
    },
  },
  blank(options) {
    const [a, b, c, d] = seedRng(options.seed);
    return { rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [], dice: [1, 1, 1], hand: [], table: [], defs: {}, next: 1, score: 0 };
  },
  contentHash: (c) => hashValue(c),
  invariants: (s) => (s.score < 0 ? [{ id: 'D-01', message: 'the score is negative' }] : []),
};

export type Where = 'hand' | 'table';
export const DICE_GAME: ScenarioGame<Dice, Where, Note> = {
  rules: DICE,
  content: CARDS,
  start: () => DICE.blank({ seed: 'fake' }, null, CARDS),
  put(s, card, where) {
    const id = `${card}#${String(s.next)}`;
    s.next += 1;
    s.defs[id] = card;
    s[where].push(id);
    return id;
  },
  probe: PROBE,
};
