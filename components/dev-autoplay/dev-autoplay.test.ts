import { describe, expect, it, vi } from 'vitest';
import { createGameStore, defineGame } from '../game-store/index.ts';
import type { Bot } from '../sim-pool/index.ts';
import type { AnswerAction } from '../engine-core/kernel.ts';
import { CONTENT, COUNTER, type Counter, type CounterState } from '../engine-core/fake/counter.ts';
import { draftOf, type GameRules } from '../engine-core/index.ts';
import { devAutoplay, readAutoplayFlag } from './index.ts';

const bot: Bot<CounterState> = { name: 'b', choose: (_v, answers, rng) => answers[rng.int(answers.length)] as AnswerAction };
// the fake's prompts carry no kind: this turn asks the same question with an alternating one
const KINDED: GameRules<Counter> = { ...COUNTER, handlers: { ...COUNTER.handlers, turn: (ctx) => {
  const s = draftOf(ctx);
  if (s.counter >= s.rules.target) { s.result = { kind: 'won' }; return; }
  s.turn += 1;
  ctx.then({ kind: 'chosen' });
  ctx.ask({ min: 1, max: 1, kind: s.turn % 2 ? 'pick' : 'draw', options: [{ id: 'add', enabled: true }, { id: 'draw', enabled: true }] });
} } };
const def = defineGame<Counter, CounterState, string>({ rules: KINDED, content: CONTENT, seats: ['me'], start: (seed) => ({ options: { seed }, rules: { target: 12 } }), view: (s) => s });
const mk = () => createGameStore(def, { seat: 'me', seed: 'demo', undo: 'free' });

describe('K372 dev-autoplay', () => {
  it('does nothing without the flag, without dev=1, or when dev is off', () => {
    for (const [search, dev] of [['', true], ['?autoplay=x', true], ['?dev=1', true], ['?dev=1&steps=3', false]] as const) {
      const s = mk();
      const id = s.get().state.prompt?.id;
      expect(devAutoplay(s, { bot, search, dev, paceMs: 0 }).status()).toEqual({ stop: 'off', steps: 0 });
      expect(s.get().state.prompt?.id).toBe(id);
    }
  });
  it('stops at the step cap', () => {
    const s = mk();
    expect(devAutoplay(s, { bot, search: '?dev=1&steps=2', paceMs: 0 }).status()).toEqual({ stop: 'steps', steps: 2 });
    expect(s.get().state.prompt).not.toBeNull();
  });
  it('stops at the chosen prompt kind, the n-th time', () => {
    const s = mk();
    expect(devAutoplay(s, { bot, search: '?dev=1&autoplay=draw', paceMs: 0 }).status()).toEqual({ stop: 'kind', steps: 1 });
    expect(s.get().state.prompt?.kind).toBe('draw');
    const t = mk();
    expect(devAutoplay(t, { bot, search: '?dev=1&autoplay=pick*2', paceMs: 0 }).status()).toEqual({ stop: 'kind', steps: 2 });
    expect(t.get().state.prompt?.kind).toBe('pick');
    expect(devAutoplay(mk(), { bot, search: '?dev=1&autoplay=nonesuch', paceMs: 0 }).status().stop).toBe('over');
  });
  it('reads the flag', () => {
    expect(readAutoplayFlag('?dev=1&autoplay=pick*2&seat=a')).toEqual({ kind: 'pick', nth: 2, seat: 'a' });
  });
  it('paces one answer per tick, and stop() halts it', () => {
    vi.useFakeTimers();
    const h = devAutoplay(mk(), { bot, search: '?dev=1&steps=3', paceMs: 100 });
    expect(h.status()).toEqual({ stop: null, steps: 1 });
    vi.advanceTimersByTime(100);
    expect(h.status().steps).toBe(2);
    h.stop();
    vi.advanceTimersByTime(1000);
    expect(h.status().steps).toBe(2);
    const g = devAutoplay(mk(), { bot, search: '?dev=1&steps=3', paceMs: 100 });
    vi.advanceTimersByTime(1000);
    expect(g.status()).toEqual({ stop: 'steps', steps: 3 });
    vi.useRealTimers();
  });
  it('over() stops with a prompt open; leave() waits for the board', () => {
    expect(devAutoplay(mk(), { bot, search: '?dev=1&steps=9', paceMs: 0, over: (st) => st.turn >= 2 }).status()).toEqual({ stop: 'over', steps: 1 });
    expect(devAutoplay(mk(), { bot, search: '?dev=1&steps=9', paceMs: 0, leave: () => true }).status()).toEqual({ stop: 'left', steps: 0 });
  });
});
