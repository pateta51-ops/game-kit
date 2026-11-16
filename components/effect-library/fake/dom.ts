// The few page globals canvas.ts and ambience.ts touch, faked for node tests: frames are stepped by hand.
import { vi } from 'vitest';

export interface FakeEl {
  tag: string;
  className: string;
  style: Record<string, string>;
  children: FakeEl[];
  parent: FakeEl | undefined;
  isConnected: boolean;
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  rect: { left: number; top: number; width: number; height: number };
  appendChild(c: FakeEl): void;
  remove(): void;
  setAttribute(): void;
  getContext(): unknown;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

export function fakeDom(o: { context?: boolean; w?: number; h?: number } = {}) {
  const frames = new Map<number, (now: number) => void>();
  let next = 1;
  const listeners: [string, unknown, unknown][] = [];
  const observers: { seen: unknown[]; off: number }[] = [];
  const made: FakeEl[] = [];
  const el = (tag: string): FakeEl => {
    const e: FakeEl = {
      tag,
      className: '',
      style: {},
      children: [],
      parent: undefined,
      isConnected: false,
      width: -1,
      height: -1,
      clientWidth: o.w ?? 300,
      clientHeight: o.h ?? 200,
      rect: { left: 10, top: 20, width: o.w ?? 300, height: o.h ?? 200 },
      appendChild(c) {
        e.children.push(c);
        c.parent = e;
        c.isConnected = true;
      },
      remove() {
        if (e.parent) e.parent.children = e.parent.children.filter((x) => x !== e);
        e.parent = undefined;
        e.isConnected = false;
      },
      setAttribute: () => undefined,
      getContext: () => (o.context === false ? null : { clearRect: () => undefined }),
      getBoundingClientRect: () => e.rect,
    };
    made.push(e);
    return e;
  };
  const body = el('body');
  const raf = (f: (now: number) => void): number => {
    frames.set(next, f);
    return next++;
  };
  const caf = (id: number): void => void frames.delete(id);
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', caf);
  vi.stubGlobal('CanvasRenderingContext2D', class {});
  vi.stubGlobal('document', { createElement: el, body });
  vi.stubGlobal('window', {
    requestAnimationFrame: raf,
    addEventListener: (k: string, f: unknown, c?: unknown) => void listeners.push([k, f, c]),
    removeEventListener: (k: string, f: unknown, c?: unknown) => {
      const i = listeners.findIndex((l) => l[0] === k && l[1] === f && l[2] === c);
      if (i >= 0) listeners.splice(i, 1);
    },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      me = { seen: [] as unknown[], off: 0 };
      constructor() {
        observers.push(this.me);
      }
      observe(t: unknown): void {
        this.me.seen.push(t);
      }
      disconnect(): void {
        this.me.off += 1;
      }
    },
  );
  return {
    el,
    body,
    made,
    listeners,
    observers,
    waiting: (): number => frames.size,
    step(now = performance.now() + 16): void {
      const run = [...frames.values()];
      frames.clear();
      run.forEach((f) => {
        f(now);
      });
    },
  };
}
