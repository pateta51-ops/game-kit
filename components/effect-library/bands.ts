// Phase band rules, banner lines that ring the cards they name, and card flight by the View Transitions API. Pure except
// `flight` (DOM) and the ring store. Opt-in.

/** Whether the phase title sweep plays: not when the phase went backward (an undo), not when the new state already
 * moves cards, not under Quick. `order` lists the phases in play order; an unknown phase plays (nothing to compare). */
export function phaseSweeps(order: readonly string[], prev: string | undefined, next: string, o: { quick?: boolean; cardsMove?: boolean } = {}): boolean {
  if (o.quick === true || o.cardsMove === true) return false;
  const a = prev === undefined ? -1 : order.indexOf(prev);
  const b = order.indexOf(next);
  return !(a >= 0 && b >= 0 && b < a);
}

/** Band slots: a "level up" band takes its own slot and never replaces the phase band. `put` returns what the slot held. */
export function createBandSlots<T>(): { put(slot: string, band: T): T | undefined; clear(slot: string): void; get(slot: string): T | undefined; all(): [string, T][] } {
  const m = new Map<string, T>();
  return {
    put(slot, band) {
      const old = m.get(slot);
      m.set(slot, band);
      return old;
    },
    clear: (slot) => void m.delete(slot),
    get: (slot) => m.get(slot),
    all: () => [...m.entries()],
  };
}

export interface BannerLine { text: string; cards?: readonly string[] }
export interface BannerKey { at: number; opacity: number; scale: number }
/** K435: opacity and scale at `t` ms between caller keyframes (`at` in ms, rising), held before the first and after the last */
export function bannerKeyAt(frames: readonly BannerKey[], t: number): { opacity: number; scale: number } {
  const i = frames.findIndex((f) => f.at > t);
  const a = frames[i < 0 ? frames.length - 1 : Math.max(0, i - 1)];
  const b = frames[i < 0 ? frames.length - 1 : i];
  if (!a || !b) return { opacity: 1, scale: 1 };
  const k = b.at === a.at ? 1 : Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at)));
  return { opacity: a.opacity + (b.opacity - a.opacity) * k, scale: a.scale + (b.scale - a.scale) * k };
}
/** K435: `frames` gives the newest line's `opacity` and `scale`, `at` in ms since it appeared */
export interface BannerOpts { stepMs?: number; holdMs?: number; tapped?: boolean; reduced?: boolean; frames?: readonly BannerKey[] }
/** The banner at `t` ms: lines appear one every `stepMs` (650); the newest rings the cards it names. Reduced motion
 * shows every line at once and rings none. `doneAt` is `holdMs` (4500) plus one beat per line, or null when it stays until tapped. */
export function bannerAt(lines: readonly BannerLine[], t: number, o: BannerOpts = {}): { shown: BannerLine[]; ring: readonly string[]; done: boolean; doneAt: number | null; opacity: number; scale: number } {
  const step = o.stepMs ?? 650;
  const doneAt = o.tapped === true ? null : (o.holdMs ?? 4500) + step * lines.length;
  const n = o.reduced === true ? lines.length : Math.min(lines.length, Math.max(0, Math.floor(t / step) + 1));
  const shown = lines.slice(0, n);
  const look = o.frames && o.reduced !== true ? bannerKeyAt(o.frames, t - step * (n - 1)) : { opacity: 1, scale: 1 };
  return { shown, ring: o.reduced === true ? [] : shown[n - 1]?.cards ?? [], done: doneAt !== null && t >= doneAt, doneAt, ...look };
}

/** A tiny store only the table reads: which cards are ringed now. */
export function createRingStore(): { set(ids: readonly string[]): void; get(): readonly string[]; subscribe(f: (ids: readonly string[]) => void): () => void } {
  let cur: readonly string[] = [];
  const subs = new Set<(ids: readonly string[]) => void>();
  return {
    set(ids) {
      if (ids.length === cur.length && ids.every((x, i) => x === cur[i])) return;
      cur = ids;
      subs.forEach((f) => { f(cur); });
    },
    get: () => cur,
    subscribe(f) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}

interface Vt { finished: Promise<void> }
type StartVt = (cb: () => void) => Vt;
/**
 * Card flight from an overlay to the board by `document.startViewTransition`. The overlay card holds `view-transition-name`
 * `name`; the target takes it only inside the callback (a duplicate name aborts the whole transition) after the overlay
 * gives it up. `swap` makes the change (hide the overlay, show the board card). Without the API, `swap` just runs.
 * Resolves when the flight is over.
 */
export async function flight(doc: Document, o: { name: string; from: HTMLElement; to: HTMLElement; swap?: () => void; className?: string }): Promise<void> {
  const start = (doc as unknown as { startViewTransition?: StartVt }).startViewTransition?.bind(doc);
  const name = (el: HTMLElement, v: string): void => {
    el.style.setProperty('view-transition-name', v);
    if (o.className !== undefined) el.style.setProperty('view-transition-class', v === 'none' ? '' : o.className);
  };
  name(o.from, o.name);
  if (!start) {
    o.swap?.();
    name(o.from, 'none');
    return;
  }
  const t = start(() => {
    name(o.from, 'none');
    name(o.to, o.name);
    o.swap?.();
  });
  try {
    await t.finished;
  } finally {
    name(o.to, 'none');
  }
}
