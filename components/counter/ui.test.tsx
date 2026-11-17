import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createToasts } from '../ui-helpers/index.ts';
import { counterOf, crossToast } from './counter.ts';
import { Counter } from './ui.tsx';

describe('Counter', () => {
  it('shows the final number at once at instant speed, no tag, and keeps the anchor and level', () => {
    const { container, rerender } = render(<Counter value={5} anchor="a.gold" thresholds={{ low: 3, out: 1 }} speed={() => 'instant'} />);
    const el = container.querySelector('[data-res="a.gold"]')!;
    expect(el.getAttribute('data-level')).toBe('ok');
    rerender(<Counter value={2} anchor="a.gold" thresholds={{ low: 3, out: 1 }} speed={() => 'instant'} />);
    expect(el.getAttribute('data-level')).toBe('low');
    expect(el.querySelector('[data-part="number"]')!.textContent).toBe('2');
    expect(document.querySelector('[data-part="tag"]')).toBeNull();
  });
  it('counts up while moving, and a press shows the final number', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const { container, rerender } = render(<Counter value={1} anchor="a.gold" speed={() => 1} />);
    rerender(<Counter value={9} anchor="a.gold" speed={() => 1} />);
    const num = container.querySelector('[data-part="number"]')!;
    expect(num.textContent).toBe('1');
    act(() => {
      fireEvent.pointerDown(window);
    });
    expect(num.textContent).toBe('9');
    expect(counterOf('a.gold')).toBeNull(); // jsdom has no layout: nothing is "on screen"
    raf.mockRestore();
  });
  it('onCross and crossToast fire on a worse level only', () => {
    const toasts = createToasts<'warn'>();
    const onCross = crossToast(toasts, { low: { text: 'low', tone: 'warn' } });
    const p = { anchor: 'a.gold', thresholds: { low: 3, out: 1 }, speed: () => 'instant' as const, onCross };
    const { rerender } = render(<Counter value={5} {...p} />);
    rerender(<Counter value={3} {...p} />);
    rerender(<Counter value={6} {...p} />);
    expect(toasts.getState().toasts.map((t) => t.text)).toEqual(['low']);
  });
});
