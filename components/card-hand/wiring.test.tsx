import { fireEvent, render } from '@testing-library/react';
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
  it('K262 grid: no fan or hint, header, empty, columns, marks, taps, phone sheet', () => {
    const taps: string[] = [], sheets: string[] = [];
    const pick = { marks: { a: 'legal', b: 'barred' }, picks: [], tap: (id: string) => taps.push(id) } as unknown as BoardPick;
    const r = render(<CardHand layout="grid" columns={3} header={<b>Hand 2</b>} view={{ cards: ['a', 'b', null] }} face={face} pick={pick} speed="instant" cardLabel={(id) => id} hint={() => 'x'} />);
    const hand = r.container.querySelector('[data-part="hand"]')!;
    expect(hand).toHaveAttribute('data-layout', 'grid');
    expect(hand.querySelector('[data-part="fan"]')).toBeNull();
    expect(hand.querySelector('[data-part="hint"]')).toBeNull();
    expect(hand.querySelector('[data-part="head"]')!.textContent).toBe('Hand 2');
    expect(hand.querySelector<HTMLElement>('[data-part="grid"]')!.style.getPropertyValue('--cols')).toBe('3');
    expect(hand.querySelector('[data-card="a"]')).toHaveAttribute('data-mark', 'legal');
    fireEvent.click(r.getByLabelText('a'));
    expect(taps).toEqual(['a']);
    r.rerender(<CardHand layout="grid" phone phoneTap="all" onSheet={(id) => sheets.push(id)} view={{ cards: ['a'] }} face={face} pick={pick} speed="instant" cardLabel={(id) => id} />);
    fireEvent.click(r.getByLabelText('a'));
    expect(sheets).toEqual(['a']);
    expect(taps).toEqual(['a']);
    r.rerender(<CardHand layout="grid" empty="None" view={{ cards: [] }} face={face} />);
    expect(r.container.querySelector('[data-part="empty"]')!.textContent).toBe('None');
  });
  it('K293: every button carries data-kit', () => {
    const { container } = render(<CardHand view={{ cards: ['a', 'b'] }} face={face} />);
    const bs = [...container.querySelectorAll('button')];
    expect(bs.length).toBe(2);
    expect(bs.every((b) => b.hasAttribute('data-kit'))).toBe(true);
  });
})
