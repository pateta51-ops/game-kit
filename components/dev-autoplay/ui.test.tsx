import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameStore, defineGame } from '../game-store/index.ts';
import type { Bot } from '../sim-pool/index.ts';
import type { AnswerAction } from '../engine-core/kernel.ts';
import { CONTENT, COUNTER, type Counter, type CounterState } from '../engine-core/fake/counter.ts';
import { useDevAutoplay } from './ui.ts';

const bot: Bot<CounterState> = { name: 'b', choose: (_v, answers, rng) => answers[rng.int(answers.length)] as AnswerAction };
const def = defineGame<Counter, CounterState, string>({ rules: COUNTER, content: CONTENT, seats: ['me'], start: (seed) => ({ options: { seed }, rules: { target: 12 } }), view: (s) => s });
const mk = () => createGameStore(def, { seat: 'me', seed: 'demo' });
afterEach(() => { vi.useRealTimers(); });

describe('K372 useDevAutoplay', () => {
  it('runs once under StrictMode and stops on unmount', () => {
    vi.useFakeTimers();
    const s = mk();
    const steps: number[] = [];
    const C = () => { useDevAutoplay(s, { bot, search: '?dev=1&steps=50', paceMs: 100, onStep: (n) => steps.push(n) }); return null; };
    const r = render(<StrictMode><C /></StrictMode>);
    vi.advanceTimersByTime(0);
    expect(steps).toEqual([1]);
    vi.advanceTimersByTime(100);
    expect(steps).toEqual([1, 2]);
    r.unmount();
    vi.advanceTimersByTime(1000);
    expect(steps).toEqual([1, 2]);
  });
});
