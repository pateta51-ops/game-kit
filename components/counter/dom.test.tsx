import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bumpCounter, rowRightOf, showTag } from './counter.ts';
import { Counter } from './ui.tsx';

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
const anims: { el: unknown; frames: Keyframe[]; ms: number }[] = [];
const fakeAnimate = function (this: HTMLElement, frames: Keyframe[], o: { duration: number }) {
  anims.push({ el: this, frames, ms: o.duration });
  return { finished: new Promise(() => undefined) };
};
const boxes = new Map<Element, DOMRect>();
const setup = () => {
  anims.length = 0;
  boxes.clear();
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = fakeAnimate;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return boxes.get(this) ?? rect(0, 0, 0, 0);
  });
};
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  window.innerWidth = 1024;
});

describe('counter DOM', () => {
  it('bumpCounter animates the bump at the speed, never at instant or 0', () => {
    setup();
    const el = document.createElement('span');
    bumpCounter(el, 0.5);
    bumpCounter(el, 'instant');
    bumpCounter(el, 0);
    expect(anims.map((a) => a.ms)).toEqual([150]);
    expect(anims[0]!.frames.map((f) => f.transform)).toEqual(['scale(1.35)', 'scale(0.92)', 'scale(1)']);
  });
  it('rowRightOf: right edge of the row on a wide screen, null on a narrow one', () => {
    setup();
    const row = document.createElement('div');
    const a = document.createElement('span');
    const b = document.createElement('span');
    const other = document.createElement('span');
    row.append(a, b, other);
    document.body.append(row);
    boxes.set(a, rect(100, 10, 50, 20));
    boxes.set(b, rect(160, 12, 80, 20));
    boxes.set(other, rect(300, 200, 90, 20));
    window.innerWidth = 1200;
    expect(rowRightOf(a)).toBe(240);
    window.innerWidth = 600;
    expect(rowRightOf(a)).toBeNull();
  });
  it('showTag: text and sign; right of the row (wide), under the counter (narrow); none at instant or no change', () => {
    setup();
    const a = document.createElement('span');
    document.body.append(a);
    boxes.set(a, rect(100, 10, 50, 20));
    window.innerWidth = 1200;
    showTag(a, 3, 1);
    const tag = document.querySelector<HTMLElement>('[data-part="tag"]')!;
    expect([tag.textContent, tag.dataset['sign']]).toEqual(['+3', '+']);
    expect(parseFloat(tag.style.left)).toBeGreaterThan(150);
    expect(anims.at(-1)!.ms).toBe(1700);
    showTag(a, -2, 1);
    const neg = [...document.querySelectorAll<HTMLElement>('[data-part="tag"]')][1]!;
    expect([neg.textContent, neg.dataset['sign']]).toEqual(['−2', '-']);
    document.querySelectorAll('[data-part="tag"]').forEach((t) => {
      t.remove();
    });
    window.innerWidth = 600;
    showTag(a, 1, 1);
    const low = document.querySelector<HTMLElement>('[data-part="tag"]')!;
    expect(parseFloat(low.style.top)).toBeGreaterThan(30);
    expect(parseFloat(low.style.left)).toBeLessThanOrEqual(100);
    low.remove();
    showTag(a, 1, 'instant');
    showTag(a, 0, 1);
    expect(document.querySelector('[data-part="tag"]')).toBeNull();
  });
  it('Counter: bumpOnChange false skips its own bump but keeps the tag', () => {
    setup();
    const { container, rerender } = render(<Counter value={1} anchor="a.x" speed={() => 1} count={false} bumpOnChange={false} />);
    boxes.set(container.querySelector('[data-res]')!, rect(10, 10, 30, 20));
    rerender(<Counter value={2} anchor="a.x" speed={() => 1} count={false} bumpOnChange={false} />);
    expect(anims.filter((a) => a.ms === 300)).toHaveLength(0);
    expect(document.querySelector('[data-part="tag"]')!.textContent).toBe('+1');
  });
  it('Counter: a change mid-count goes on from the number shown so far', () => {
    setup();
    let q: ((t: number) => void)[] = [];
    let now = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => q.push(f));
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { container, rerender } = render(<Counter value={0} anchor="a.x" speed={() => 1} />);
    rerender(<Counter value={10} anchor="a.x" speed={() => 1} />);
    const num = container.querySelector('[data-part="number"]')!;
    now = 350;
    act(() => {
      const run = q;
      q = [];
      run.forEach((f) => {
        f(now);
      });
    });
    expect(num.textContent).toBe('9');
    rerender(<Counter value={20} anchor="a.x" speed={() => 1} />);
    expect(num.textContent).toBe('9');
  });
});
