export interface PanSession {
  ensure(target: unknown): Promise<void>;
  /** K452: `tab` is the button to press on return (default: the tab active when the session began) */
  back(tab?: HTMLElement | null): Promise<void>;
}

export type PanFactory = (scale: number, signal: AbortSignal) => PanSession | null;

export interface ScrollPanOptions {
  scroller: () => HTMLElement | null;
  tabs?: (target: string) => HTMLElement | null;
  activeTab?: () => HTMLElement | null;
  inView?: (element: Element, scroller: HTMLElement) => boolean;
  /** K444: press the tab, then wait this many ms (default: three frames, at most 150 ms). */
  tabWaitMs?: number;
  /** K444: ease length in ms before the motion scale (default 350). */
  panMs?: number;
  /** K452: false never presses a tab button (default true) */
  clickTabs?: boolean;
  /** K452: scroll sideways: centre the target in scrollLeft, restore scrollLeft on return */
  horizontal?: boolean;
  /** K452: the tab button `back()` presses when called without one */
  backTab?: () => HTMLElement | null | undefined;
}

const PAN_MS = 350;

function inViewX(element: Element, scroller: HTMLElement): boolean {
  const r = element.getBoundingClientRect();
  const m = scroller.getBoundingClientRect();
  const middle = r.left + r.width / 2;
  const inside = r.width <= m.width
    ? r.left >= m.left - 2 && r.right <= m.right + 2
    : middle >= m.left && middle <= m.right;
  return r.width > 0 && r.height > 0 && inside && r.bottom > m.top && r.top < m.bottom;
}

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
export function scrollPan({ scroller, tabs, activeTab, inView: shown, tabWaitMs, panMs = PAN_MS, clickTabs = true, horizontal = false, backTab }: ScrollPanOptions): PanFactory {
  return (scale, signal) => {
    const main = scroller();
    if (!main || !(scale > 0) || main.ownerDocument.visibilityState === 'hidden') return null;
    const win = main.ownerDocument.defaultView;
    if (!win) return null;
    const see = shown ?? (horizontal ? inViewX : inView);
    const home = { tab: activeTab?.(), top: main.scrollTop, left: main.scrollLeft };

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
      if (!clickTabs || !tab || signal.aborted || tab === activeTab?.()) return;
      tab.click();
      if (tabWaitMs !== undefined) {
        await wait(() => false, tabWaitMs, () => {});
        return;
      }
      let left = 3;
      await wait(() => --left === 0, 150, () => {});
    };

    const scrollTo = (el: HTMLElement, top: number): Promise<void> => {
      if (signal.aborted) return Promise.resolve();
      const from = horizontal ? el.scrollLeft : el.scrollTop;
      const set = (v: number): void => { if (horizontal) el.scrollLeft = v; else el.scrollTop = v; };
      if (Math.abs(top - from) < 2) {
        set(top);
        return Promise.resolve();
      }
      const start = win.performance.now();
      const ms = panMs * scale;
      return wait((now) => {
        const k = Math.max(0, Math.min(1, (now - start) / ms));
        const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        set(from + (top - from) * eased);
        return k === 1;
      }, ms + 200, () => { set(top); });
    };

    const one = async (target: string): Promise<void> => {
      await goTab(tabs?.(target));
      if (signal.aborted) return;
      const el = scroller();
      const actor = el?.querySelector(target);
      if (!el || !actor || see(actor, el)) return;
      const r = actor.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const m = el.getBoundingClientRect();
      await scrollTo(el, Math.max(0, horizontal
        ? Math.min(el.scrollLeft + (r.left + r.right - m.left - m.right) / 2, Math.max(0, el.scrollWidth - el.clientWidth))
        : el.scrollTop + (r.top + r.bottom - m.top - m.bottom) / 2));
    };

    return {
      ensure: async (target) => {
        const list = Array.isArray(target) ? target : [target];
        for (const t of list) {
          if (signal.aborted) return;
          if (typeof t === 'string') await one(t);
        }
      },
      back: async (tab) => {
        await goTab(tab ?? backTab?.() ?? home.tab);
        const el = scroller();
        if (el) await scrollTo(el, horizontal ? home.left : home.top);
      },
    };
  };
}
