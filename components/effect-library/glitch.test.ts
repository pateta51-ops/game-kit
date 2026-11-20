// The glitch scheduler on a faked element: seeded slices, options, repeat, no timer while motion is off, destroy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Speed } from '../motion-frame/index.ts';
import { createGlitch, type GlitchOptions } from './glitch.ts';

interface Fake {
  style: { setProperty(k: string, v: string): void; props: Record<string, string> };
  classes: Set<string>;
  children: Fake[];
  childNodes: Fake[];
  offsetWidth: number;
  className: string;
  classList: { add(...c: string[]): void; remove(...c: string[]): void };
  setAttribute(): void;
  appendChild(c: Fake): void;
  cloneNode(): Fake;
  querySelectorAll(): Fake[];
  remove(): void;
  removeAttribute(): void;
}
function fake(parent?: Fake): Fake {
  const props: Record<string, string> = {};
  const classes = new Set<string>();
  const children: Fake[] = [];
  const f: Fake = {
    style: { props, setProperty: (k, v) => void (props[k] = v) },
    classes,
    children,
    childNodes: children,
    offsetWidth: 0,
    className: '',
    classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)) },
    setAttribute() {},
    removeAttribute() {},
    appendChild(c) {
      f.children.push(c);
    },
    cloneNode: () => fake(),
    querySelectorAll: () => [],
    remove() {
      if (parent) parent.children.splice(parent.children.indexOf(f), 1);
    },
  };
  return f;
}
let host: Fake;
const mount = () => {
  host = fake();
  host.children.push(fake()); // the wordmark's own content
};
beforeEach(() => {
  vi.useFakeTimers();
  mount();
  vi.stubGlobal('document', { createElement: () => fake(host) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const make = (o: Partial<GlitchOptions> & { speed?: () => Speed }) => createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, ...o });
const mk = (seed: number, speed: () => Speed = () => 1) => make({ seed, speed });
const sliceEls = () => host.children.filter((c) => c.className.includes('fx-glitch-slice'));
const tops = () => sliceEls().map((c) => c.style.props['--top']);
const on = (k: string) => host.classes.has(`fx-glitch--${k}`);
const fast = { idleMs: [1000, 1000] as [number, number] };

describe('glitch', () => {
  it('copies the content into two colour copies and the slices (no mask), and keeps the original', () => {
    mk(1);
    expect(host.children).toHaveLength(1 + 2 + 3);
    expect(host.classes.has('fx-glitch--masked')).toBe(false);
    expect(host.children[1]?.children).toHaveLength(1);
  });
  it('picks different slice positions per burst, and the same ones again for the same seed', () => {
    const g = mk(5);
    g.burst();
    const a = tops();
    g.burst();
    const b = tops();
    expect(a).not.toEqual(b);
    expect(a).toHaveLength(3);
    g.destroy();
    mount();
    const h = mk(5);
    h.burst();
    expect(tops()).toEqual(a);
  });
  it('slices, dropout, colours, split, jump and mask reach the element', () => {
    make({ slices: 5, dropout: 0.1, colours: ['red', 'blue'], split: 1.5, jump: 4, mask: 'url(x.svg)' });
    expect(sliceEls()).toHaveLength(5);
    expect(host.style.props).toMatchObject({ '--glitch-dropout': '0.1', '--glitch-a': 'red', '--glitch-b': 'blue', '--glitch-split': '1.5%', '--glitch-jump': '4', '--glitch-mask': 'url(x.svg)' });
    expect(host.classes.has('fx-glitch--masked')).toBe(true);
  });
  it('bursts after the idle gap, ends, and schedules the next', () => {
    make({ seed: 1, ...fast });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(on('burst')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(on('burst')).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
  });
  it('a burst may repeat once after the gap, with new slices, then idles again', () => {
    make({ seed: 1, repeat: 1, repeatGapMs: [100, 100], burstMs: 200, ...fast });
    vi.advanceTimersByTime(1000);
    const first = tops();
    vi.advanceTimersByTime(200);
    expect([on('burst'), vi.getTimerCount()]).toEqual([false, 1]);
    vi.advanceTimersByTime(99);
    expect(on('burst')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(on('burst')).toBe(true);
    expect(tops()).not.toEqual(first);
    vi.advanceTimersByTime(200);
    expect([on('burst'), vi.getTimerCount()]).toEqual([false, 1]);
    vi.advanceTimersByTime(999);
    expect(on('burst')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(on('burst')).toBe(true);
  });
  it('tear lasts longer than a burst and its end clears the state', () => {
    const g = make({ seed: 1, ...fast });
    g.tear();
    expect([on('tear'), host.style.props['--glitch-ms']]).toEqual([true, '600ms']);
    vi.advanceTimersByTime(599);
    expect(on('tear')).toBe(true);
    vi.advanceTimersByTime(1);
    expect([on('tear'), vi.getTimerCount()]).toEqual([false, 1]);
  });
  it('update while a burst plays keeps it and adds no second timer', () => {
    const g = make({ seed: 1, ...fast });
    g.burst();
    g.update();
    expect([on('burst'), vi.getTimerCount()]).toEqual([true, 1]);
    vi.advanceTimersByTime(200);
    expect([on('burst'), vi.getTimerCount()]).toEqual([false, 1]);
  });
  it('a manual burst is followed by the idle schedule', () => {
    const g = make({ seed: 1, ...fast });
    g.burst();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(200);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(on('burst')).toBe(true);
  });
  it('schedules no timer while motion is off, and restarts when it is back', () => {
    let s: Speed = 'instant';
    const g = mk(1, () => s);
    expect(vi.getTimerCount()).toBe(0);
    g.burst();
    g.tear();
    expect([vi.getTimerCount(), on('burst')]).toEqual([0, false]);
    s = 1;
    g.update();
    expect(vi.getTimerCount()).toBe(1);
    s = 'instant';
    g.update();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('destroy clears timers, classes and layers', () => {
    const g = mk(1);
    g.burst();
    g.destroy();
    expect([vi.getTimerCount(), host.children.length, host.classes.size]).toEqual([0, 1, 0]);
    g.burst();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('burstMs range, burstSteps and jumpRange stay in range; no timer at instant', () => {
    const g = make({ seed: 3, burstMs: [160, 280], burstSteps: [3, 5], jumpRange: [2, 4] });
    for (let k = 0; k < 20; k++) {
      mount();
      const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: k, burstMs: [160, 280], burstSteps: [3, 5], jumpRange: [2, 4] });
      h.burst();
      const len = parseFloat(host.style.props['--glitch-ms']!);
      expect(len).toBeGreaterThanOrEqual(160);
      expect(len).toBeLessThanOrEqual(280);
      expect(on('steps')).toBe(true);
      const seen = new Set<string>();
      const grab = () => {
        for (const s of sliceEls()) {
          const j = Math.abs(parseFloat(s.style.props['--jump']!));
          expect(j).toBeGreaterThanOrEqual(2);
          expect(j).toBeLessThanOrEqual(4);
        }
        seen.add(tops().join());
      };
      grab();
      for (let t = 0; t < len; t += 1) {
        vi.advanceTimersByTime(1);
        grab();
      }
      expect(seen.size).toBeGreaterThanOrEqual(3);
      expect(seen.size).toBeLessThanOrEqual(5);
      expect(on('steps')).toBe(false);
      h.destroy();
    }
    g.destroy();
    mount();
    const z = make({ seed: 1, burstSteps: 3, speed: () => 'instant' });
    z.burst();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('without the new options the burst is the CSS animation and 200 ms', () => {
    const g = mk(2);
    g.burst();
    expect(on('burst')).toBe(true);
    expect(on('steps')).toBe(false);
    expect(host.style.props['--glitch-ms']).toBe('200ms');
    expect(vi.getTimerCount()).toBe(1);
  });
});
