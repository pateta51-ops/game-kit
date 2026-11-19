import type { Speed } from './player.ts';

// Ported from STCC viewTransition.ts (a69c8dac), via LordOfTheRings (a3f3c01).
/** K402: `onCardStart(0, id)` fires once, when the flight takes off (at once under instant); `signal` abort skips the flight to its end state. */
export interface ViewTransitionOpts { onCardStart?: (index: number, id: string) => void; id?: string; signal?: AbortSignal }
export async function withViewTransition(apply: () => void | Promise<void>, speed: Speed, o: ViewTransitionOpts = {}): Promise<void> {
  const started = () => { if (!o.signal?.aborted) o.onCardStart?.(0, o.id ?? ''); };
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function' || speed === 'instant' || !(speed > 0)) {
    await apply();
    started();
    return;
  }
  const marked = new Set<Element>();
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
    const skip = () => { transition.skipTransition?.(); };
    if (o.signal?.aborted) skip(); else o.signal?.addEventListener('abort', skip, { once: true });
    void transition.ready?.then(started, () => undefined);
    await transition.finished.catch(() => undefined);
    await transition.updateCallbackDone;
  } finally {
    for (const el of marked) el.removeAttribute('data-vt-clipped');
  }
}
