export interface PanSession {
  ensure(target: unknown): Promise<void>;
  back(): Promise<void>;
}

export type PanFactory = (scale: number, signal: AbortSignal) => PanSession | null;

export interface ScrollPanOptions {
  scroller: () => HTMLElement | null;
  tabs?: (target: string) => HTMLElement | null;
  activeTab?: () => HTMLElement | null;
  inView?: (element: Element, scroller: HTMLElement) => boolean;
}

const PAN_MS = 350;

function inView(element: Element, scroller: HTMLElement): boolean {
  const r = element.getBoundingClientRect();
  const m = scroller.getBoundingClientRect();
  const middle = r.top + r.height / 2;
  const inside = r.height <= m.height
    ? r.top >= m.top - 2 && r.bottom <= m.bottom + 2
    : middle >= m.top && middle <= m.bottom;
  return r.width > 0 && r.height > 0 && inside && r.right > m.left && r.left < m.right;
}

// STCC a69c8dac: follow the tab's own button, centre the target, then restore the starting tab and scroll.
export function scrollPan({ scroller, tabs, activeTab, inView: shown = inView }: ScrollPanOptions): PanFactory {
  return (scale, signal) => {
    const main = scroller();
    if (!main || !(scale > 0) || main.ownerDocument.visibilityState === 'hidden') return null;
    const win = main.ownerDocument.defaultView;
    if (!win) return null;
    const home = { tab: activeTab?.(), top: main.scrollTop };

    const wait = (tick: (now: number) => boolean, ms: number, timeout: () => void): Promise<void> =>
      new Promise((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        let frame: number;
        const done = (): void => {
          win.cancelAnimationFrame(frame);
          win.clearTimeout(timer);
          signal.removeEventListener('abort', done);
          resolve();
        };
        const timer = win.setTimeout(() => {
          timeout();
          done();
        }, ms);
        const step = (now: number): void => {
          if (tick(now)) done();
          else frame = win.requestAnimationFrame(step);
        };
        signal.addEventListener('abort', done, { once: true });
        frame = win.requestAnimationFrame(step);
      });

    const goTab = async (tab: HTMLElement | null | undefined): Promise<void> => {
      if (!tab || signal.aborted || tab === activeTab?.()) return;
      tab.click();
      let left = 3;
      await wait(() => --left === 0, 150, () => {});
    };

    const scrollTo = (el: HTMLElement, top: number): Promise<void> => {
      if (signal.aborted) return Promise.resolve();
      const from = el.scrollTop;
      if (Math.abs(top - from) < 2) {
        el.scrollTop = top;
        return Promise.resolve();
      }
      const start = win.performance.now();
      const ms = PAN_MS * scale;
      return wait((now) => {
        const k = Math.max(0, Math.min(1, (now - start) / ms));
        const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        el.scrollTop = from + (top - from) * eased;
        return k === 1;
      }, ms + 200, () => { el.scrollTop = top; });
    };

    return {
      ensure: async (target) => {
        if (signal.aborted || typeof target !== 'string') return;
        await goTab(tabs?.(target));
        if (signal.aborted) return;
        const el = scroller();
        const actor = el?.querySelector(target);
        if (!el || !actor || shown(actor, el)) return;
        const r = actor.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const m = el.getBoundingClientRect();
        await scrollTo(el, Math.max(0, el.scrollTop + (r.top + r.bottom - m.top - m.bottom) / 2));
      },
      back: async () => {
        await goTab(home.tab);
        const el = scroller();
        if (el) await scrollTo(el, home.top);
      },
    };
  };
}
