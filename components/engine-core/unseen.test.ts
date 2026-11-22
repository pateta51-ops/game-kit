// K641: a lone legal answer the answering player has not seen (`unseen: true`) is never taken for the player.
import { describe, expect, it } from 'vitest';
import { applyAction, askOrTake, bar, createGame, draftOf, onlyOne, type Ctx, type GameRules, type KernelOption, type OnlyOneNotice } from './index.ts';
import { CONTENT, COUNTER, RULES, type Counter, type CounterTask } from './fake/counter.ts';

const game = (top: KernelOption, notices: OnlyOneNotice[]): GameRules<Counter> => ({
  ...COUNTER,
  handlers: {
    ...COUNTER.handlers,
    turn: (ctx: Ctx<Counter>) => {
      if (ctx.s.counter >= 2) {
        draftOf(ctx).result = { kind: 'won' };
        return;
      }
      ctx.then({ kind: 'chosen' });
      const n = askOrTake(ctx, { seat: 0, min: 1, max: 1, options: [top, bar('skip', 'condition', 'Not now')] });
      if (n !== null) notices.push(n);
    },
    chosen: (ctx: Ctx<Counter>, t: CounterTask) => {
      if (t.answer?.[0] === 'top') draftOf(ctx).counter += 1;
      ctx.then({ kind: 'turn' });
    },
  },
});

describe('a lone answer the player has not seen (K641)', () => {
  it('K641 the only legal answer is face down for the answering seat: the player is asked, nothing is taken', () => {
    const notices: OnlyOneNotice[] = [];
    const g = game({ id: 'top', enabled: true, unseen: true }, notices);
    let s = createGame(g, { seed: 'k641' }, RULES, CONTENT).state;
    expect(notices).toEqual([]);
    expect(s.counter).toBe(0);
    expect(s.prompt?.seat).toBe(0);
    expect(s.prompt?.options.map((o) => [o.id, o.enabled])).toEqual([['top', true], ['skip', false]]);
    s = applyAction(g, s, { kind: 'answer', promptId: s.prompt?.id ?? 0, picks: ['top'] }, CONTENT).state;
    expect(s.counter).toBe(1);
    expect(s.prompt?.options[0]).toEqual({ id: 'top', enabled: true, unseen: true });
    s = applyAction(g, s, { kind: 'answer', promptId: s.prompt?.id ?? 0, picks: ['top'] }, CONTENT).state;
    expect(s.result).toEqual({ kind: 'won' });
    expect(notices).toEqual([]);
    expect(onlyOne({ min: 1, max: 1, options: [{ id: 'top', enabled: true, unseen: true }] })).toBeNull();
    expect(onlyOne({ min: 2, max: 2, options: [{ id: 'a', enabled: true }, { id: 'back', enabled: true, alone: true, unseen: true }] })).toBeNull();
  });

  it('K641 contrast: the same lone answer, seen, is taken without asking as before', () => {
    const notices: OnlyOneNotice[] = [];
    const s = createGame(game({ id: 'top', enabled: true }, notices), { seed: 'k641' }, RULES, CONTENT).state;
    expect(s.result).toEqual({ kind: 'won' });
    expect(s.counter).toBe(2);
    expect(s.prompt).toBeNull();
    expect(notices.map((n) => n.taken)).toEqual(['top', 'top']);
    expect(onlyOne({ min: 1, max: 1, options: [{ id: 'top', enabled: true }, { id: 'under', enabled: false, unseen: true }] })?.taken).toBe('top');
  });
});
