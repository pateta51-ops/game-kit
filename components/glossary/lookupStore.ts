// The open lookup, a store of its own (lifted from warps src/ui/glossary/lookupStore.ts and lookupLayout.ts): the entries
// opened (the last one shown) and where the link was on the screen. Opening, following, going back and closing touch only
// this store, so a lookup never changes the game.
import { create } from 'zustand';

/** A box on the screen in CSS pixels: where the link was pressed. */
export interface LookupAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface LookupState {
  trail: string[];
  anchor: LookupAnchor | null;
  open: (id: string, anchor?: LookupAnchor | null) => void;
  follow: (id: string) => void;
  back: () => void;
  close: () => void;
}

export const useLookup = create<LookupState>()((set, get) => ({
  trail: [],
  anchor: null,
  open: (id, anchor = null) => {
    set({ trail: [id], anchor });
  },
  follow: (id) => {
    const trail = get().trail;
    if (trail.at(-1) !== id) set({ trail: [...trail, id] });
  },
  back: () => {
    set({ trail: get().trail.slice(0, -1) });
  },
  close: () => {
    set({ trail: [], anchor: null });
  },
}));

export const anchorOf = (el: Element): LookupAnchor => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

/** Open an entry from a link: inside the open lookup it follows (Back returns), elsewhere it opens beside the link. */
export function openEntry(id: string, el: Element): void {
  const store = useLookup.getState();
  if (el.closest('[data-lookup]') !== null && store.trail.length > 0) store.follow(id);
  else store.open(id, anchorOf(el));
}

/** Where a popover of `size` goes beside `a`: right of it, else left, else centred; always on screen. */
export function besideAnchor(
  a: LookupAnchor,
  size: { width: number; height: number },
  screen: { width: number; height: number },
  gap = 12,
): { left: number; top: number } {
  const clamp = (v: number, max: number): number => Math.max(gap, Math.min(v, max - gap));
  let left: number;
  if (a.right + gap + size.width <= screen.width - gap) left = a.right + gap;
  else if (a.left - gap - size.width >= gap) left = a.left - gap - size.width;
  else left = (screen.width - size.width) / 2;
  return { left: clamp(left, screen.width - size.width), top: clamp(a.top, screen.height - size.height) };
}
