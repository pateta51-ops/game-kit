import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Drag } from '../drag-drop/ui.tsx';
import type { BoardPick } from '../prompt-host/ui.ts';
import { noteLaunch } from './index.ts';
import { CardHand, useGlideIn } from './ui.tsx';

const rect0 = HTMLElement.prototype.getBoundingClientRect.bind(HTMLElement.prototype);
afterEach(() => { delete (HTMLElement.prototype as { animate?: unknown }).animate; HTMLElement.prototype.getBoundingClientRect = rect0; });

const face = (id: string) => <i>{id}</i>;
const fakeDrag = (source: string | null) => ({ dragging: source === null ? null : { source }, sourceProps: (id: string) => ({ 'data-drag': id, onPointerDown: () => undefined }), onClickCapture: () => undefined }) as unknown as Drag;
const fakePick = (picks: string[]) => ({ marks: { a: 'legal', b: 'legal' }, picks, armed: null, ready: false, tap: () => undefined, tapMany: () => undefined, confirm: () => undefined, cancel: () => undefined }) as unknown as BoardPick;

describe('card-hand wiring (K218)', () => {
  it('drag: data-drag on each strip, data-drop-block on the fan, the dragged card marked', () => {
    const { container } = render(<CardHand view={{ cards: ['a', 'b'] }} face={face} drag={fakeDrag('a')} />);
    expect(container.querySelector('[data-part="fan"]')).toHaveAttribute('data-drop-block');
    expect([...container.querySelectorAll('[data-part="strip"]')].map((e) => e.getAttribute('data-drag'))).toEqual(['a', 'b']);
    const cards = container.querySelectorAll('[data-part="card"]');
    expect(cards[0]).toHaveAttribute('data-dragging');
    expect(cards[1]).not.toHaveAttribute('data-dragging');
  });
  it('the dragged card is hidden in the fan by the shipped CSS rule', async () => {
    const css = (await import('node:fs')).readFileSync(`${import.meta.dirname}/card-hand.css`, 'utf8');
    expect(css).toMatch(/\[data-dragging\] > \[data-part='face'\][^{]*\{[^}]*visibility: hidden/);
  });
  it('a picked card has data-picked, the others unpicked; no pick: none', () => {
    const { container, rerender } = render(<CardHand view={{ cards: ['a', 'b'] }} face={face} pick={fakePick(['a'])} />);
    const cards = container.querySelectorAll('[data-part="card"]');
    expect(cards[0]).toHaveAttribute('data-picked', 'picked');
    expect(cards[1]).toHaveAttribute('data-picked', 'unpicked');
    rerender(<CardHand view={{ cards: ['a', 'b'] }} face={face} pick={fakePick([])} />);
    expect(container.querySelector('[data-picked]')).toBeNull();
  });
  it('a back has no hint, no data-card, no pick attributes; its data-key names no card', () => {
    const { container } = render(<CardHand view={{ cards: [null, 'a'] }} face={face} pick={fakePick(['a'])} hint={() => 'Play'} />);
    const [back, front] = [...container.querySelectorAll('[data-part="card"]')];
    expect(back!.querySelector('[data-part="hint"]')).toBeNull();
    expect(back).not.toHaveAttribute('data-card');
    expect(back).not.toHaveAttribute('data-mark');
    expect(back).not.toHaveAttribute('data-picked');
    expect(back!.getAttribute('data-key')).toBe('back:0');
    expect(front!.querySelector('[data-part="hint"]')).not.toBeNull();
  });
  it('only the new card rises', () => {
    const rose: string[] = [];
    (HTMLElement.prototype as { animate?: unknown }).animate = function (this: HTMLElement) { rose.push(this.getAttribute('data-key') ?? '?'); };
    const r = render(<CardHand view={{ cards: ['a', 'b'] }} face={face} speed={1} />);
    r.rerender(<CardHand view={{ cards: ['a', 'b', 'c'] }} face={face} speed={1} />);
    expect(rose).toEqual(['c']);
  });
  it('useGlideIn: the target animates from the noted rect, once', () => {
    const calls: { el: HTMLElement; frames: Keyframe[] }[] = [];
    (HTMLElement.prototype as { animate?: unknown }).animate = function (this: HTMLElement, frames: Keyframe[]) { calls.push({ el: this, frames }); };
    function Play({ ids }: { ids: string[] }) {
      const ref = useRef<HTMLDivElement | null>(null);
      useGlideIn(ref, ids, 1);
      return <div ref={ref}>{ids.map((id) => <b key={id} data-glide={id} />)}</div>;
    }
    const r = render(<Play ids={[]} />);
    noteLaunch('x', { left: 100, top: 300, width: 100, height: 140 });
    HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 140, right: 100, bottom: 140, x: 0, y: 0, toJSON: () => ({}) });
    r.rerender(<Play ids={['x']} />);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.el).toHaveAttribute('data-glide', 'x');
    expect(calls[0]!.frames[0]).toMatchObject({ translate: '100px 300px' });
    r.rerender(<Play ids={['x', 'y']} />);
    expect(calls).toHaveLength(1);
  });
});
