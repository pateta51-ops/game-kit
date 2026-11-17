import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KernelOption } from '../engine-core/index.ts';
import { useBoardPick, type Answer } from '../prompt-host/ui.ts';
import { fanOf, msAt, noteLaunch, playKeyframes, shiftOf, spreadOf, stepOf, takeLaunch } from './index.ts';
import { CardHand } from './ui.tsx';

const opts = (...ids: string[]): KernelOption[] => ids.map((id) => ({ id, enabled: !id.startsWith('-') }));
const prompt = (options: KernelOption[]) => ({ id: 1, kind: 'k', options, min: 1, max: 1 });

function Hand({ cards, answer, speed = 'instant' }: { cards: (string | null)[]; answer: Answer; speed?: number | 'instant' }) {
  const pick = useBoardPick(prompt(opts('a', '-b')), answer, { confirm: false });
  return <CardHand view={{ cards }} face={(id) => <i>{id}</i>} pick={pick} speed={speed} />;
}

afterEach(() => { delete (HTMLElement.prototype as { animate?: unknown }).animate; });

describe('card-hand (K218)', () => {
  it('fan arithmetic: arc capped, symmetric, drop = radius (1 - cos)', () => {
    expect(fanOf(0, 1)).toEqual({ k: 0, angle: 0, drop: 0 });
    expect(fanOf(0, 3).angle).toBe(-8);
    expect(fanOf(0, 9).angle).toBeCloseTo(-16);
    expect(fanOf(2, 5).drop).toBe(0);
    expect(fanOf(4, 5).drop).toBeCloseTo(4 * (1 - Math.cos((16 * Math.PI) / 180)));
    expect(fanOf(0, 3, { step: 2 }).angle).toBe(-2);
  });
  it('width fit, neighbour spread and clamp', () => {
    expect(stepOf(3, 1000, 100, 60)).toBe(60);
    expect(stepOf(11, 500, 100, 60, 0)).toBe(40);
    expect(stepOf(1, 500, 100, 60)).toBe(60);
    expect([0, 1, 2, 3, 4, 5].map((i) => spreadOf(i, 2))).toEqual([-0.65, -1, 0, 1, 0.65, 0.4]);
    expect(spreadOf(0, null)).toBe(0);
    expect(shiftOf(1, 2, 40, 100, 400)).toBe(40);
    expect(shiftOf(1, 2, 150, 100, 400)).toBe(0 + 200 - 50 - 300);
  });
  it('speed: none at 0, instant or reduced motion', () => {
    expect(msAt(280, 2, false)).toBe(140);
    expect(msAt(280, 0, false)).toBe(0);
    expect(msAt(280, 'instant', false)).toBe(0);
    expect(msAt(280, 1, true)).toBe(0);
  });
  it('marks from the prompt, a tap answers through pick.tap', () => {
    const answer = vi.fn<Answer>();
    const { container } = render(<Hand cards={['a', '-b']} answer={answer} />);
    const cards = container.querySelectorAll('[data-part="card"]');
    expect(cards[0]).toHaveAttribute('data-mark', 'legal');
    expect(cards[1]).toHaveAttribute('data-mark', 'barred');
    fireEvent.click(cards[1]!.querySelector('button')!);
    expect(answer).not.toHaveBeenCalled();
    fireEvent.click(cards[0]!.querySelector('button')!);
    expect(answer).toHaveBeenCalledWith(['a'], 1);
  });
  it('a back has no id in the DOM, no button, no mark', () => {
    const { container } = render(<Hand cards={[null, null, 'secret-x']} answer={vi.fn()} />);
    const html = container.innerHTML;
    expect(html.match(/data-card=/g)).toHaveLength(1);
    const { container: c2 } = render(<CardHand view={{ count: 3 }} face={() => 'x'} />);
    expect(c2.querySelectorAll('[data-part="card"]')).toHaveLength(3);
    expect(c2.querySelectorAll('button')).toHaveLength(0);
    expect(c2.querySelectorAll('[data-card]')).toHaveLength(0);
    expect(c2.querySelectorAll('[data-part="back"]')).toHaveLength(3);
  });
  it('a new card rises in when animated, not at speed 0 or the first draw', () => {
    const animate = vi.fn();
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    const face = (id: string) => id;
    const r = render(<CardHand view={{ cards: ['a'] }} face={face} speed={1} />);
    expect(animate).not.toHaveBeenCalled();
    r.rerender(<CardHand view={{ cards: ['a', 'b'] }} face={face} speed={1} />);
    expect(animate).toHaveBeenCalledTimes(1);
    r.rerender(<CardHand view={{ cards: ['a', 'b', 'c'] }} face={face} speed={0} />);
    expect(animate).toHaveBeenCalledTimes(1);
  });
  it('the play glide: a tap notes the card, takeLaunch gives it once', () => {
    const { container } = render(<Hand cards={['a']} answer={vi.fn()} speed={1} />);
    fireEvent.click(container.querySelector('button')!);
    expect(takeLaunch('a')).not.toBeNull();
    expect(takeLaunch('a')).toBeNull();
    noteLaunch('z', { left: 0, top: 0, width: 10, height: 10 }, 0);
    expect(takeLaunch('z', 5000)).toBeNull();
    expect(playKeyframes({ left: 0, top: 0, width: 10, height: 10 }, { left: 100, top: 0, width: 20, height: 20 })).toHaveLength(3);
  });
});
