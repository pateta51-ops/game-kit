// K88 (barred options with codes, only-option notice) and K89 (preview by probe, stopping at hidden information).
import { describe, expect, it } from 'vitest';
import { askOrTake, bar, blocked, createGame, legalIn, legalTable, draftOf, hashState, onlyOne, preview, setRngOverrides, validateAction, type Ctx, type GameRules, type OnlyOneNotice } from './index';
import { CONTENT, COUNTER, playGame, RULES, type Counter, type CounterState, type CounterTask } from './fake/counter';

const notices: OnlyOneNotice[] = [];
const game = (forced: boolean): GameRules<Counter> => ({
  ...COUNTER,
  handlers: {
    ...COUNTER.handlers,
    turn: (ctx: Ctx<Counter>) => {
      if (ctx.s.counter >= 3) {
        draftOf(ctx).result = { kind: 'won' };
        return;
      }
      ctx.then({ kind: 'chosen' });
      const n = askOrTake(ctx, {
        min: 1,
        max: 1,
        options: forced
          ? [{ id: 'one', enabled: true }, bar('draw', 'noTarget', 'No card to draw', 'a card in the pile')]
          : [{ id: 'one', enabled: true }, { id: 'draw', enabled: true }, { id: 'roll', enabled: true }, { id: 'sub', enabled: true }, bar('two', 'cannotPay', 'Costs 2')],
      });
      if (n !== null) notices.push(n);
    },
    chosen: (ctx: Ctx<Counter>, t: CounterTask) => {
      const s = draftOf(ctx);
      const a = t.answer?.[0];
      if (a === 'one') {
        s.counter += 1;
        ctx.emit({ type: 'added', n: 1 });
      } else if (a === 'roll') {
        s.counter += 1;
        ctx.emit({ type: 'added', n: 1 });
        ctx.then({ kind: 'roll' });
        return;
      } else if (a === 'draw') {
        ctx.emit({ type: 'drawn', card: s.pile[0] ?? 0, reveal: true });
      } else if (a === 'sub') {
        ctx.then({ kind: 'chosen' });
        ctx.ask({ min: 1, max: 1, options: [{ id: 'one', enabled: true }] });
        return;
      }
      ctx.then({ kind: 'turn' });
    },
    roll: (ctx: Ctx<Counter>) => {
      const n = 1 + ctx.rng.int(2, 'roll');
      draftOf(ctx).counter += n;
      ctx.emit({ type: 'added', n });
      ctx.then({ kind: 'turn' });
    },
  },
});
const start = (g: GameRules<Counter>): CounterState => createGame(g, { seed: 'k88' }, RULES, CONTENT).state;
const count = (s: CounterState) => ({ counter: s.counter });

describe('barred options and the only option (K88)', () => {
  it('a barred option keeps its code and what was missing; validateAction names the code', () => {
    const s = start(game(false));
    expect(blocked(s.prompt)).toEqual([{ id: 'two', reason: 'cannotPay', why: 'Costs 2', missing: undefined }]);
    expect(blocked({ options: [{ id: 'x', enabled: false }] })).toEqual([{ id: 'x', reason: 'barred', why: undefined, missing: undefined }]);
    expect(bar('draw', 'noTarget', 'No card', 'a card in the pile')).toEqual({ id: 'draw', enabled: false, reason: 'noTarget', why: 'No card', missing: 'a card in the pile' });
    const v = validateAction(s, { kind: 'answer', promptId: s.prompt?.id ?? 0, picks: ['two'] });
    expect(v).toEqual({ ok: false, error: 'NOT_LEGAL: "two" cannot be chosen (cannotPay): Costs 2.' });
  });

  it('one legal answer is taken without asking and its notice lists every option', () => {
    notices.length = 0;
    const s = start(game(true));
    expect(s.result).toEqual({ kind: 'won' });
    expect(s.counter).toBe(3);
    expect(notices).toHaveLength(3);
    expect(notices[0]?.taken).toBe('one');
    expect(notices[0]?.options.map((o) => [o.id, o.reason])).toEqual([['one', undefined], ['draw', 'noTarget']]);
    expect(onlyOne({ min: 0, max: 1, options: [{ id: 'a', enabled: true }] })).toBeNull();
  });

  it('a game that does not opt in replays to the hash recorded on main before K88', () => {
    expect(hashState(playGame('k88-hash').state)).toBe('602cdcdb66ea896e');
  });
});

describe('preview by probe (K89)', () => {
  const g = game(false);
  const s = start(g);

  it('runs, discards and returns before/after numbers', () => {
    const p = preview(g, s, ['one'], CONTENT, { count });
    expect(p.stop).toBe('complete');
    expect(p.numbers).toEqual({ counter: { before: 0, after: 1 } });
    expect(p.events.map((e) => e.type)).toEqual(['added']);
    expect(s.counter).toBe(0);
  });

  it('stops at a reveal and at randomness, keeping only what came before', () => {
    expect(preview(g, s, ['draw'], CONTENT, { count })).toEqual({ stop: 'hiddenInformation', events: [], numbers: { counter: { before: 0, after: 0 } } });
    const r = preview(g, s, ['roll'], CONTENT, { count });
    expect(r.stop).toBe('hiddenInformation');
    expect(r.numbers).toEqual({ counter: { before: 0, after: 1 } });
    expect(r.events).toHaveLength(1);
  });

  it('a named random override leaves the rng alone, so the probe completes', () => {
    setRngOverrides({ roll: () => 1 });
    try {
      expect(preview(g, s, ['roll'], CONTENT, { count }).numbers).toEqual({ counter: { before: 0, after: 3 } });
    } finally {
      setRngOverrides(null);
    }
  });

  it('keeps every event of a task past the state log cap', () => {
    const big: GameRules<Counter> = { ...g, handlers: { ...g.handlers, chosen: (ctx, t) => {
      g.handlers['chosen']?.(ctx, t);
      for (let i = 0; i < 249; i += 1) ctx.emit({ type: 'added', n: 0 });
    } } };
    const r = preview(big, s, ['roll'], CONTENT, { count });
    expect(r.stop).toBe('hiddenInformation');
    expect(r.events).toHaveLength(250);
  });

  it('stops at a nested choice and refuses an illegal answer', () => {
    expect(preview(g, s, ['sub'], CONTENT, { nested: (a) => a.prompt?.options.length === 1 }).stop).toBe('choice');
    expect(preview(g, s, ['sub'], CONTENT).stop).toBe('complete');
    const bad = preview(g, s, ['two'], CONTENT, { count });
    expect(bad.stop).toBe('rejected');
    expect(bad.error).toMatch(/NOT_LEGAL/);
  });
});

describe('K119 legal table', () => {
  it('groups options by verb and noun, barred ones kept', () => {
    const t = legalTable({ options: [{ id: 'space:12', enabled: true }, bar('space:13', 'noTarget'), { id: 'piece:p1', enabled: true }, { id: 'pass', enabled: true }] });
    expect(Object.keys(t)).toEqual(['space', 'piece', 'option']);
    expect(t.space?.['13']?.reason).toBe('noTarget');
    expect(legalIn(t, 'space', '12')?.id).toBe('space:12');
    expect(legalIn(t, 'space', '13')).toBeUndefined();
    expect(legalIn(t, 'card', '1')).toBeUndefined();
    expect(legalIn(t, 'option', 'pass')?.id).toBe('pass');
    expect(Object.keys(legalTable(null))).toEqual([]);
    const u = legalTable({ options: [{ id: '__proto__:constructor', enabled: true }] });
    expect(legalIn(u, '__proto__', 'constructor')?.id).toBe('__proto__:constructor');
    expect(legalIn(t, 'constructor', 'x')).toBeUndefined();
    const s = start(game(false));
    const e = legalTable(s.prompt);
    expect(Object.keys(e.option ?? {})).toEqual(['one', 'draw', 'roll', 'sub', 'two']);
    expect(legalIn(e, 'option', 'two')).toBeUndefined();
    expect(legalIn(e, 'option', 'one')?.id).toBe('one');
    expect(Object.keys(legalTable({ options: [{ id: 'a.b', enabled: true }] }, (id) => id.split('.') as [string, string]).a ?? {})).toEqual(['b']);
  });
});
