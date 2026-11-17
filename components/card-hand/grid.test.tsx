import { readFileSync } from 'node:fs';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Drag } from '../drag-drop/ui.tsx';
import type { BoardPick } from '../prompt-host/ui.ts';
import { CardHand } from './ui.tsx';

const face = (id: string) => <i>{id}</i>;
const mkPick = (tap: (id: string) => void = () => undefined, picks: string[] = []) => ({ marks: { a: 'legal', b: 'barred' }, picks, tap }) as unknown as BoardPick;
const fakeDrag = (source: string | null) => ({ dragging: source === null ? null : { source }, sourceProps: (id: string) => ({ 'data-drag': id, onPointerDown: () => undefined }), onClickCapture: () => undefined }) as unknown as Drag;
const G = { layout: 'grid', speed: 'instant', face, cardLabel: (id: string) => id } as const;
afterEach(() => { delete (HTMLElement.prototype as { animate?: unknown }).animate; });

describe('card-hand grid (K262, Imperium Hand.tsx + phone.css)', () => {
  it('the default layout is still the fan', () => {
    const { container } = render(<CardHand view={{ cards: ['a'] }} face={face} />);
    expect(container.querySelector('[data-part="fan"]')).not.toBeNull();
    expect(container.querySelector('[data-part="grid"]')).toBeNull();
    expect(container.querySelector('[data-part="hand"]')).not.toHaveAttribute('data-layout');
  });
  it('grid: no fan or hint, header, columns, drop block', () => {
    const { container } = render(<CardHand {...G} columns={3} header={<b>Hand 2</b>} hint={() => 'x'} view={{ cards: ['a', 'b'] }} />);
    expect(container.querySelector('[data-part="hand"]')).toHaveAttribute('data-layout', 'grid');
    expect(container.querySelector('[data-part="fan"]')).toBeNull();
    expect(container.querySelector('[data-part="hint"]')).toBeNull();
    expect(container.querySelector('[data-part="head"]')!.textContent).toBe('Hand 2');
    const g = container.querySelector<HTMLElement>('[data-part="grid"]')!;
    expect(g.style.getPropertyValue('--cols')).toBe('3');
    expect(g).toHaveAttribute('data-drop-block');
  });
  it('empty hand: only the empty content, no list; empty is not shown while cards are present', () => {
    const r = render(<CardHand {...G} empty="None" header="H" view={{ cards: [] }} />);
    expect(r.container.querySelector('[data-part="empty"]')!.textContent).toBe('None');
    expect(r.container.querySelector('ol')).toBeNull();
    r.rerender(<CardHand {...G} empty="None" view={{ cards: ['a'] }} />);
    expect(r.container.querySelector('[data-part="empty"]')).toBeNull();
    expect(r.container.querySelector('ol')).not.toBeNull();
  });
  it('null cards are backs: no id, button or mark', () => {
    const { container } = render(<CardHand {...G} pick={mkPick()} view={{ cards: ['a', null] }} back={() => <u data-part="back" />} />);
    const b = container.querySelectorAll('[data-part="card"]')[1]!;
    expect(b.querySelector('button')).toBeNull();
    expect(b).not.toHaveAttribute('data-card');
    expect(b).not.toHaveAttribute('data-mark');
    expect(b.querySelector('[data-part="back"]')).not.toBeNull();
  });
  it('marks from the prompt, markOf mark, why and title; barred is aria-disabled', () => {
    const { container, getByLabelText } = render(<CardHand {...G} pick={mkPick()} markOf={(id) => (id === 'a' ? { mark: 'dim', why: 'No gold' } : undefined)} view={{ cards: ['a', 'b'] }} />);
    const [a, b] = container.querySelectorAll('[data-part="card"]');
    expect(a).toHaveAttribute('data-mark', 'dim');
    expect(a).toHaveAttribute('data-why', 'No gold');
    expect(getByLabelText('a')).toHaveAttribute('title', 'No gold');
    expect(getByLabelText('a')).not.toHaveAttribute('aria-disabled');
    expect(b).toHaveAttribute('data-mark', 'barred');
    expect(getByLabelText('b')).toHaveAttribute('aria-disabled', 'true');
  });
  it('stripProps: the game\'s props, composed onClick, the kit\'s aria-label wins', () => {
    const seen: string[] = [];
    const { getByLabelText } = render(<CardHand {...G} pick={mkPick((id) => seen.push('tap' + id))} stripProps={(id) => ({ 'aria-label': 'mine', 'data-x': id, className: 'k', onClick: () => seen.push('own') })} view={{ cards: ['a'] }} />);
    const s = getByLabelText('a');
    expect(s).toHaveAttribute('data-x', 'a');
    expect(s).toHaveClass('k');
    fireEvent.click(s);
    expect(seen).toEqual(['own', 'tapa']);
  });
  it('onTap: via key for detail 0, pointer for a click, detail > 1 dropped; pick.tap not called', () => {
    const taps: unknown[] = [], picked: string[] = [];
    const { getByLabelText } = render(<CardHand {...G} pick={mkPick((id) => picked.push(id))} onTap={(id, i) => taps.push([id, i.via, i.detail])} view={{ cards: ['a', 'b'] }} />);
    fireEvent.click(getByLabelText('a'));
    fireEvent.click(getByLabelText('a'), { detail: 1 });
    fireEvent.click(getByLabelText('a'), { detail: 2 });
    fireEvent.click(getByLabelText('b'), { detail: 1 });
    expect(taps).toEqual([['a', 'key', 0], ['a', 'pointer', 1], ['b', 'pointer', 1]]);
    expect(picked).toEqual([]);
  });
  it('phone tap-all opens the sheet and answers nothing', () => {
    const sheets: string[] = [], taps: string[] = [];
    const { getByLabelText } = render(<CardHand {...G} phone phoneTap="all" onSheet={(id) => sheets.push(id)} pick={mkPick((id) => taps.push(id))} view={{ cards: ['a', 'b'] }} />);
    fireEvent.click(getByLabelText('b'));
    expect(sheets).toEqual(['b']);
    expect(taps).toEqual([]);
  });
  it('drag: sourceProps on each strip, the dragged card is data-dragging', () => {
    const { container } = render(<CardHand {...G} drag={fakeDrag('a')} view={{ cards: ['a', 'b'] }} />);
    expect([...container.querySelectorAll('[data-part="strip"]')].map((e) => e.getAttribute('data-drag'))).toEqual(['a', 'b']);
    const c = container.querySelectorAll('[data-part="card"]');
    expect(c[0]).toHaveAttribute('data-dragging');
    expect(c[1]).not.toHaveAttribute('data-dragging');
  });
  it('picked card: data-picked, others unpicked', () => {
    const { container } = render(<CardHand {...G} pick={mkPick(undefined, ['a'])} view={{ cards: ['a', 'b'] }} />);
    const c = container.querySelectorAll('[data-part="card"]');
    expect(c[0]).toHaveAttribute('data-picked', 'picked');
    expect(c[1]).not.toHaveAttribute('data-picked', 'picked');
  });
  it('draw-in: a new card rises at speed 1; speed 0 or instant is still', () => {
    const rose: string[] = [];
    (HTMLElement.prototype as { animate?: unknown }).animate = vi.fn(function (this: HTMLElement) { rose.push(this.getAttribute('data-key') ?? '?'); });
    const r = render(<CardHand {...G} speed={1} view={{ cards: ['a'] }} />);
    r.rerender(<CardHand {...G} speed={1} view={{ cards: ['a', 'b'] }} />);
    expect(rose).toEqual(['b']);
    for (const speed of [0, 'instant'] as const) {
      r.rerender(<CardHand {...G} speed={speed} view={{ cards: ['a', 'b', speed === 0 ? 'c' : 'd'] }} />);
    }
    expect(rose).toEqual(['b']);
  });
  it('band: bandHeight sets --hand-band-h and data-scroll; only then the shipped CSS scrolls', () => {
    const r = render(<CardHand {...G} view={{ cards: ['a'] }} />);
    const h = () => r.container.querySelector<HTMLElement>('[data-part="hand"]')!;
    expect(h()).not.toHaveAttribute('data-scroll');
    r.rerender(<CardHand {...G} bandHeight="20rem" view={{ cards: ['a'] }} />);
    expect(h()).toHaveAttribute('data-scroll');
    expect(h().style.getPropertyValue('--hand-band-h')).toBe('20rem');
    const css = readFileSync(`${import.meta.dirname}/card-hand.css`, 'utf8');
    expect(css).toMatch(/\[data-scroll\] > \[data-part='grid'\] \{[^}]*overflow-y: auto/);
    expect(css.match(/overflow-y/g)).toHaveLength(1);
    expect(css).toMatch(/\[data-layout='grid'\] \[data-part='face'\] \{[^}]*transform: none;[^}]*transition: none/);
  });
});
