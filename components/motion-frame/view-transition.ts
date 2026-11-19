import type { Speed } from './player.ts';

// Ported from STCC viewTransition.ts (a69c8dac), via LordOfTheRings (a3f3c01).
/** K402: `onCardStart(0, id)` fires once, when the flight takes off (at once under instant); `signal` abort skips the flight to its end state. */
export interface ViewTransitionOpts { onCardStart?: (index: number, id: string) => void; id?: string; signal?: AbortSignal;
  /** K431: planned staggered starts (ms from takeoff, ascending); `onCardStart(i, id)` fires once per card when its delay is reached, instead of the single start at ready. */
  cards?: { id: string; delay: number }[];
  /** K431: name of a native CSS animation whose currentTime is the clock for `cards` (else time since ready). */
  clock?: string }
export async function withViewTransition(apply: () => void | Promise<void>, speed: Speed, o: ViewTransitionOpts = {}): Promise<void> {
  const cards = o.cards;
  let next = 0;
  const fireTo = (elapsed: number): void => {
    while (cards && next < cards.length && cards[next]!.delay <= elapsed && !o.signal?.aborted) { const i = next++; o.onCardStart?.(i, cards[i]!.id); }
  };
  const started = () => { if (cards) fireTo(Infinity); else if (!o.signal?.aborted) o.onCardStart?.(0, o.id ?? ''); };
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function' || speed === 'instant' || !(speed > 0)) {
    await apply();
    started();
    return;
  }
  let frame = 0;
  let stopped = false;
  const follow = (): void => {
    const t0 = performance.now();
    let clock: Animation | undefined;
    const tick = (): void => {
      if (stopped) return;
      if (o.clock) clock ??= document.getAnimations?.().find((a) => (a as CSSAnimation).animationName === o.clock);
      const e = o.clock ? clock?.currentTime : performance.now() - t0;
      if (typeof e === 'number') fireTo(e);
      if (next < cards!.length) frame = requestAnimationFrame(tick);
    };
    tick();
  };
  const marked = new Set<Element>();
  let skip = (): void => undefined;
  const unnameClipped = (): void => {
    for (const el of document.querySelectorAll('[data-vt-clip] [style*="view-transition-name"]')) {
      const panel = el.closest('[data-vt-clip]');
      if (!panel || el.closest('[hidden]') || el.hasAttribute('data-vt-clipped')) continue;
      const box = panel.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      if (rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1 && rect.left >= box.left - 1 && rect.right <= box.right + 1) continue;
      el.setAttribute('data-vt-clipped', '');
      marked.add(el);
    }
  };
  try {
    unnameClipped();
    const transition = document.startViewTransition(async () => {
      for (const el of marked) el.removeAttribute('data-vt-clipped');
      marked.clear();
      await apply();
      unnameClipped();
    });
    skip = () => { transition.skipTransition?.(); };
    if (o.signal?.aborted) skip(); else o.signal?.addEventListener('abort', skip, { once: true });
    void transition.ready?.then(cards ? follow : started, () => undefined);
    await transition.finished.catch(() => undefined);
    await transition.updateCallbackDone;
    if (cards) fireTo(Infinity);
  } finally {
    stopped = true;
    cancelAnimationFrame(frame);
    o.signal?.removeEventListener('abort', skip);
    for (const el of marked) el.removeAttribute('data-vt-clipped');
  }
}
