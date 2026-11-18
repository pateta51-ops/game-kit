import type { Speed } from './player.ts';

// Ported from STCC viewTransition.ts (a69c8dac), via LordOfTheRings (a3f3c01).
export async function withViewTransition(apply: () => void | Promise<void>, speed: Speed): Promise<void> {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function' || speed === 'instant' || !(speed > 0)) {
    await apply();
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
    await transition.finished.catch(() => undefined);
    await transition.updateCallbackDone;
  } finally {
    for (const el of marked) el.removeAttribute('data-vt-clipped');
  }
}
