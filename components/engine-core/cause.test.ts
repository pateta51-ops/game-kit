import { describe, expect, it } from 'vitest';
import { applyAction, causeProblems, createGame, effectCause, inCause, makeCtx, ruleCause, type Cause, type GameRules, type KernelEvent, type TaskHandler } from './index';
import { bareState, CONTENT, COUNTER, RULES, type Counter, type CounterEvent } from './fake/counter';

const chosen = COUNTER.handlers['chosen'] as TaskHandler<Counter>;
const CAUSED: GameRules<Counter> = { ...COUNTER, handlers: { ...COUNTER.handlers, chosen: (ctx, t) => inCause(ctx, ruleCause('C-ADD'), () => chosen(ctx, t)) } };
const add = (s: Counter['state']): Counter['action'] => ({ kind: 'answer', promptId: (s.prompt as { id: number }).id, picks: ['add'] });

describe('step causes (K79)', () => {
  it('a game that never calls inCause emits events with no cause key', () => {
    const s = createGame(COUNTER, { seed: 'c' }, RULES, CONTENT).state;
    const r = applyAction(COUNTER, s, add(s), CONTENT);
    expect(r.events.length).toBe(1);
    expect('cause' in (r.events[0] as object)).toBe(false);
  });

  it('inCause stamps its cause on the events emitted inside it', () => {
    const s = createGame(CAUSED, { seed: 'c' }, RULES, CONTENT).state;
    const r = applyAction(CAUSED, s, add(s), CONTENT);
    expect(r.events[0]).toMatchObject({ type: 'added', cause: { rule: 'C-ADD' } });
    expect((r.state.log[r.state.log.length - 1] as KernelEvent | undefined)?.cause).toEqual({ rule: 'C-ADD' });
  });

  it('the innermost cause wins, the outer one comes back after it, an explicit cause is kept, cause: undefined keeps the active one, none outside', () => {
    const events: CounterEvent[] = [];
    const ctx = makeCtx(COUNTER, bareState(), CONTENT, events);
    inCause(ctx, ruleCause('R-1'), () => {
      inCause(ctx, effectCause('card:1', 'card:A:2'), () => ctx.emit({ type: 'added', n: 1 }));
      ctx.emit({ type: 'added', n: 2 });
      inCause(ctx, undefined, () => ctx.emit({ type: 'added', n: 3 }));
      ctx.emit({ type: 'added', n: 4, cause: { rule: 'R-2' } });
      ctx.emit({ type: 'added', n: 6, cause: undefined });
    });
    ctx.emit({ type: 'added', n: 5 });
    expect(events.map((e) => (e as KernelEvent).cause)).toEqual([{ effect: 'card:1', line: 'card:A:2' }, { rule: 'R-1' }, { rule: 'R-1' }, { rule: 'R-2' }, { rule: 'R-1' }, undefined]);
  });

  it('causeProblems lists counted events with no cause, an empty id or line, or an unknown rule', () => {
    const ev = (seq: number, cause?: Cause, type = 'added'): KernelEvent => ({ seq, type, ...(cause ? { cause } : {}) }) as KernelEvent;
    const events = [ev(1), ev(2, ruleCause('')), ev(3, effectCause('e', '')), ev(4, ruleCause('X-9')), ev(5, ruleCause('C-1')), ev(6, effectCause('e', 'l')), ev(7, undefined, 'note')];
    const known = (c: Cause): string | null => ('rule' in c && c.rule.startsWith('X') ? `unknown rule ${c.rule}` : null);
    expect(causeProblems(events, { counts: (e) => (e as { type?: string }).type === 'added', known })).toEqual([
      'event 1 (added): no cause',
      'event 2 (added): an empty rule id',
      'event 3 (added): an effect cause without its record or printed line',
      'event 4 (added): unknown rule X-9',
    ]);
  });
});
