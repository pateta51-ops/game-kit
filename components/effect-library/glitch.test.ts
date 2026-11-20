// The glitch scheduler on a faked element: seeded slices, options, repeat, no timer while motion is off, destroy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Speed } from '../motion-frame/index.ts';
import { createGlitch, type GlitchOptions } from './glitch.ts';

interface Fake {
  style: { setProperty(k: string, v: string): void; removeProperty(k: string): void; props: Record<string, string> };
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
  nodeType: number;
  data: string;
  remove(): void;
  removeAttribute(): void;
}
function fake(parent?: Fake): Fake {
  const props: Record<string, string> = {};
  const classes = new Set<string>();
  const children: Fake[] = [];
  const f: Fake = {
    style: { props, setProperty: (k, v) => void (props[k] = v), removeProperty: (k) => void delete props[k] },
    nodeType: 1,
    data: '',
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
    for (let k = 0; k < 20; k++) {
      mount();
      const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: k, burstMs: [160, 280], burstSteps: [3, 5], jumpRange: [2, 4] });
      h.burst();
      const len = parseFloat(host.style.props['--glitch-ms']!);
      expect(len).toBeGreaterThanOrEqual(160);
      expect(len).toBeLessThanOrEqual(280);
      expect(on('steps')).toBe(true);
      expect(vi.getTimerCount()).toBeGreaterThanOrEqual(3);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(5);
      const grab = () => {
        for (const s of sliceEls()) {
          const j = Math.abs(parseFloat(s.style.props['--jump']!));
          expect(j).toBeGreaterThanOrEqual(2);
          expect(j).toBeLessThanOrEqual(4);
        }
      };
      grab();
      for (let t = 0; t < len; t += 1) {
        vi.advanceTimersByTime(1);
        grab();
      }
      expect(on('steps')).toBe(false);
      h.destroy();
    }
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
  it('destroy mid stepped burst leaves no timer and no steps class', () => {
    const g = make({ seed: 4, burstSteps: 4 });
    g.burst();
    vi.advanceTimersByTime(60);
    expect(on('steps')).toBe(true);
    g.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(on('steps')).toBe(false);
  });
  it('instant + update() mid stepped burst clears timers and the steps class', () => {
    let sp: Speed = 1;
    const g = make({ seed: 4, burstSteps: 4, speed: () => sp });
    g.burst();
    vi.advanceTimersByTime(60);
    expect(on('steps')).toBe(true);
    sp = 'instant';
    g.update();
    expect(vi.getTimerCount()).toBe(0);
    expect(on('steps')).toBe(false);
  });
  it('repeat 1 with burstSteps plays a second stepped burst; tear still works', () => {
    const g = make({ seed: 2, burstSteps: 3, repeat: 1, idleMs: [1000, 1000], repeatGapMs: [100, 100] });
    vi.advanceTimersByTime(1000);
    expect(on('steps')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(on('steps')).toBe(false);
    vi.advanceTimersByTime(100);
    expect(on('steps')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(on('steps')).toBe(false);
    g.tear();
    expect(on('tear')).toBe(true);
    expect(on('steps')).toBe(false);
  });
  it('old path: jump stays within jump x 0.6-1.4 and the variables are unchanged', () => {
    const g = make({ seed: 6, jump: 2.4 });
    for (let k = 0; k < 10; k++) {
      g.burst();
      for (const s of sliceEls()) {
        const j = Math.abs(parseFloat(s.style.props['--jump']!));
        expect(j).toBeGreaterThanOrEqual(0.6);
        expect(j).toBeLessThanOrEqual(1.4);
      }
    }
    expect(host.style.props['--glitch-jump']).toBe('2.4');
    expect(host.style.props['--glitch-ms']).toBe('200ms');
    expect(on('burst')).toBe(true);
  });
  it('each step redraws the split side', () => {
    let both = 0;
    for (let k = 1; k <= 10; k++) {
      mount();
      const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: k, burstMs: 200, burstSteps: 5 });
      h.burst();
      const sides = new Set([host.style.props['--glitch-side']]);
      for (let t = 0; t < 200; t++) {
        vi.advanceTimersByTime(1);
        sides.add(host.style.props['--glitch-side']);
      }
      if (sides.size === 2) both++;
      h.destroy();
    }
    expect(both).toBeGreaterThan(5);
  });
  it('burstMs range without steps draws lengths inside the range', () => {
    const lens = new Set<number>();
    for (let k = 1; k <= 10; k++) {
      mount();
      const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: k, burstMs: [160, 280] });
      h.burst();
      const len = parseFloat(host.style.props['--glitch-ms']!);
      expect(len).toBeGreaterThanOrEqual(160);
      expect(len).toBeLessThanOrEqual(280);
      expect(on('burst')).toBe(true);
      expect(on('steps')).toBe(false);
      lens.add(len);
      h.destroy();
    }
    expect(lens.size).toBeGreaterThan(1);
  });
  it('jumpRange with a fixed seed: every jump inside the range, sign varies', () => {
    const g = make({ seed: 11, jumpRange: [2, 4] });
    const signs = new Set<number>();
    for (let k = 0; k < 10; k++) {
      g.burst();
      for (const s of sliceEls()) {
        const v = parseFloat(s.style.props['--jump']!);
        expect(Math.abs(v)).toBeGreaterThanOrEqual(2);
        expect(Math.abs(v)).toBeLessThanOrEqual(4);
        signs.add(Math.sign(v));
      }
    }
    expect(signs.size).toBe(2);
    expect(host.style.props['--glitch-jump']).toBe('1');
  });
  describe('K473 skew and blank', () => {
    const withText = (txt: string) => {
      mount();
      const t = fake();
      t.nodeType = 3;
      t.data = txt;
      host.children.length = 0;
      host.children.push(t);
      return t;
    };
    const frames = (len: number, f: () => void) => {
      for (let t = 0; t < len; t++) {
        vi.advanceTimersByTime(1);
        f();
      }
    };
    it('skewDeg: angle in range on exactly one frame (stepped)', () => {
      for (let k = 0; k < 10; k++) {
        mount();
        const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: k, burstMs: 200, burstSteps: 5, skewDeg: [3, 6] });
        h.burst();
        const seen: number[] = [];
        const grab = () => {
          const v = parseFloat(host.style.props['--glitch-skew'] ?? '0');
          if (!seen.length || seen[seen.length - 1] !== v) seen.push(v);
        };
        grab();
        frames(199, grab);
        const nz = seen.filter((v) => v !== 0);
        expect(nz).toHaveLength(1);
        expect(Math.abs(nz[0]!)).toBeGreaterThanOrEqual(3);
        expect(Math.abs(nz[0]!)).toBeLessThanOrEqual(6);
        vi.advanceTimersByTime(5);
        expect(host.style.props['--glitch-skew']).toBeUndefined();
        h.destroy();
      }
    });
    it('skewDeg: plain burst sets the variable in range, cleared at the end; absent: never set', () => {
      mount();
      const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: 2, skewDeg: [4, 5] });
      h.burst();
      const v = parseFloat(host.style.props['--glitch-skew']!);
      expect(Math.abs(v)).toBeGreaterThanOrEqual(4);
      expect(Math.abs(v)).toBeLessThanOrEqual(5);
      vi.advanceTimersByTime(250);
      expect(host.style.props['--glitch-skew']).toBeUndefined();
      mount();
      const g = make({ seed: 2, burstSteps: 3 });
      g.burst();
      vi.advanceTimersByTime(250);
      expect(Object.keys(host.style.props)).not.toContain('--glitch-skew');
    });
    it('blankLetters: count in range on one frame, restored next frame and at the end (stepped)', () => {
      for (let k = 0; k < 10; k++) {
        const t = withText('GLITCH WORD');
        const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: k, burstMs: 200, burstSteps: 4, blankLetters: [2, 3] });
        h.burst();
        const counts: number[] = [];
        const grab = () => counts.push([...t.data].filter((c) => c === ' ').length);
        grab();
        frames(199, grab);
        const nz = counts.filter((c) => c > 0);
        expect(nz.length).toBeGreaterThan(0);
        expect(nz.length).toBeLessThanOrEqual(50 + 1);
        expect(new Set(nz).size).toBe(1);
        expect(nz[0]).toBeGreaterThanOrEqual(2);
        expect(nz[0]).toBeLessThanOrEqual(3);
        expect(counts.filter((c) => c > 0).length).toBeLessThan(counts.length);
        vi.advanceTimersByTime(5);
        expect(t.data).toBe('GLITCH WORD');
        h.destroy();
      }
    });
    it('blankLetters: plain burst blanks then restores; destroy and motion off mid-burst restore', () => {
      for (const how of ['end', 'destroy', 'off'] as const) {
        const t = withText('GLITCH');
        let sp: Speed = 1;
        const h = createGlitch(host as unknown as HTMLElement, { speed: () => sp, repeat: 0, seed: 1, burstMs: 200, burstSteps: 1, blankLetters: [2, 2] });
        h.burst();
        expect(t.data).not.toBe('GLITCH');
        expect([...t.data].filter((c) => c === ' ')).toHaveLength(2);
        if (how === 'destroy') h.destroy();
        else if (how === 'off') {
          sp = 'instant';
          h.update();
        } else vi.advanceTimersByTime(250);
        expect(t.data).toBe('GLITCH');
        h.destroy();
      }
      const t = withText('GLITCH');
      const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: 3, burstMs: 200, blankLetters: [1, 1] });
      h.burst();
      const seen: boolean[] = [];
      seen.push(t.data !== 'GLITCH');
      frames(199, () => seen.push(t.data !== 'GLITCH'));
      expect(seen).toContain(true);
      expect(seen).toContain(false);
      expect(t.data).toBe('GLITCH');
      h.destroy();
    });
    it('blankLetters is ignored with a mask and with no text', () => {
      const t = withText('GLITCH');
      createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: 1, mask: 'url(x.svg)', burstSteps: 1, blankLetters: [2, 2] }).burst();
      expect(t.data).toBe('GLITCH');
      mount();
      createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: 1, burstSteps: 1, blankLetters: [2, 2] }).burst();
      expect(host.classes.has('fx-glitch--steps')).toBe(true);
    });
    it('stepped blank is restored exactly on the next step', () => {
      for (let k = 0; k < 10; k++) {
        const t = withText('GLITCH WORD');
        const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: k, burstMs: 200, burstSteps: 4, blankLetters: [2, 3] });
        h.burst();
        const at: string[] = [t.data];
        for (let i = 1; i < 4; i++) {
          vi.advanceTimersByTime(50);
          at.push(t.data);
        }
        const j = at.findIndex((d) => d !== 'GLITCH WORD');
        expect(at.filter((d) => d !== 'GLITCH WORD')).toHaveLength(1);
        expect(at[j]).toHaveLength(11);
        if (j < 3) expect(at[j + 1]).toBe('GLITCH WORD');
        vi.advanceTimersByTime(50);
        expect(t.data).toBe('GLITCH WORD');
        h.destroy();
      }
    });
    it('a game text change mid-blank survives', () => {
      const t = withText('GLITCH');
      const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: 1, burstMs: 200, burstSteps: 1, blankLetters: [2, 2] });
      h.burst();
      expect(t.data).not.toBe('GLITCH');
      t.data = 'NEW';
      vi.advanceTimersByTime(250);
      expect(t.data).toBe('NEW');
      h.destroy();
      expect(t.data).toBe('NEW');
    });
    it('a second burst and tear() during a blanked frame leave the text intact', () => {
      const t = withText('GLITCH');
      const h = createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: 1, burstMs: 200, burstSteps: 1, blankLetters: [2, 2] });
      h.burst();
      expect(t.data).not.toBe('GLITCH');
      h.burst();
      expect([...t.data].filter((c) => c === '\u00a0')).toHaveLength(2);
      h.tear();
      expect(t.data).toBe('GLITCH');
      vi.advanceTimersByTime(700);
      expect(t.data).toBe('GLITCH');
      h.destroy();
    });
    it('no text: nothing blanked; astral letters are never split', () => {
      mount();
      const before = host.children.map((c) => c.data);
      createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: 1, burstSteps: 1, blankLetters: [2, 2] }).burst();
      expect(host.children.slice(0, before.length).map((c) => c.data)).toEqual(before);
      const t = withText('\u{1D4D0}\u{1D4D1} \u{1D4D2}');
      createGlitch(host as unknown as HTMLElement, { speed: () => 1, repeat: 0, seed: 1, burstSteps: 1, blankLetters: [2, 2] }).burst();
      expect(Array.from(t.data)).toHaveLength(4);
      expect(Array.from(t.data).filter((c) => c === '\u00a0')).toHaveLength(2);
      expect(t.data).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    });
    it('plain burst without skewDeg sets no transform; with it, the skew class', () => {
      mount();
      make({ seed: 1 }).burst();
      expect(host.style.props['transform']).toBeUndefined();
      expect(on('skew')).toBe(false);
      mount();
      make({ seed: 1, skewDeg: [3, 4] }).burst();
      expect(on('skew')).toBe(true);
    });
  });
});
