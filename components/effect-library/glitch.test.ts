// The glitch scheduler on a faked element: seeded slices, no timer while motion is off, destroy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Speed } from '../motion-frame/index.ts';
import { createGlitch } from './glitch.ts';

interface Fake {
  style: { setProperty(k: string, v: string): void; props: Record<string, string> };
  classes: Set<string>;
  children: Fake[];
  offsetWidth: number;
  className: string;
  classList: { add(...c: string[]): void; remove(...c: string[]): void };
  setAttribute(): void;
  appendChild(c: Fake): void;
  remove(): void;
}
function fake(parent?: Fake): Fake {
  const props: Record<string, string> = {};
  const classes = new Set<string>();
  const f: Fake = {
    style: { props, setProperty: (k, v) => void (props[k] = v) },
    classes,
    children: [],
    offsetWidth: 0,
    className: '',
    classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)) },
    setAttribute() {},
    appendChild(c) {
      f.children.push(c);
    },
    remove() {
      if (parent) parent.children = parent.children.filter((c) => c !== f);
    },
  };
  return f;
}
let host: Fake;
beforeEach(() => {
  vi.useFakeTimers();
  host = fake();
  vi.stubGlobal('document', { createElement: () => fake(host) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const mk = (seed: number, speed: () => Speed = () => 1) => createGlitch(host as unknown as HTMLElement, { speed, seed, repeat: 0 });
const tops = () => host.children.map((c) => c.style.props['--top']);

describe('glitch', () => {
  it('picks different slice positions per burst, and the same ones again for the same seed', () => {
    const g = mk(5);
    g.burst();
    const a = tops();
    g.burst();
    const b = tops();
    expect(a).not.toEqual(b);
    expect(a).toHaveLength(3);
    g.destroy();
    host = fake();
    const h = mk(5);
    h.burst();
    expect(tops()).toEqual(a);
  });
  it('bursts after the idle gap, ends, and schedules the next', () => {
    mk(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(7000);
    expect(host.classes.has('fx-glitch--burst')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(host.classes.has('fx-glitch--burst')).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
  });
  it('tear lasts longer than a burst', () => {
    const g = mk(1);
    g.tear();
    expect(host.classes.has('fx-glitch--tear')).toBe(true);
    expect(host.style.props['--glitch-ms']).toBe('600ms');
  });
  it('schedules no timer while motion is off, and restarts when it is back', () => {
    let s: Speed = 'instant';
    const g = mk(1, () => s);
    expect(vi.getTimerCount()).toBe(0);
    g.burst();
    g.tear();
    expect([vi.getTimerCount(), host.classes.has('fx-glitch--burst')]).toEqual([0, false]);
    s = 1;
    g.update();
    expect(vi.getTimerCount()).toBe(1);
    s = 'instant';
    g.update();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('destroy clears timers, classes and slices', () => {
    const g = mk(1);
    g.burst();
    g.destroy();
    expect([vi.getTimerCount(), host.children.length, host.classes.size]).toEqual([0, 0, 0]);
    g.burst();
    expect(vi.getTimerCount()).toBe(0);
  });
});
