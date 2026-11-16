// Re-implemented from the idea of arkham.build's card-link tooltip hook (AGPL-3.0: idea only, no code copied). One pair of
// listeners on any container finds the link under the pointer and asks the game to float a tooltip there.
import { realTimers, type Timers } from './timers';

export interface LinkPointerEvent {
  target: unknown;
  pointerType?: string;
}

export interface LinkRoot {
  addEventListener: (type: 'pointermove' | 'pointerdown', fn: (e: LinkPointerEvent) => void) => void;
  removeEventListener: (type: 'pointermove' | 'pointerdown', fn: (e: LinkPointerEvent) => void) => void;
}

export interface LinkTooltipOptions<El extends { closest: (selector: string) => El | null }> {
  /** CSS selector of a link, e.g. `[data-card]`. */
  selector: string;
  /** The id a link stands for (null: no tooltip). */
  read: (link: El) => string | null;
  open: (id: string, link: El) => void;
  close: () => void;
  /** Rest before the first open; while a tooltip is up or was just closed, the next link opens at once. */
  restMs?: number;
  /** How long after a close the next link still opens at once. */
  graceMs?: number;
  timers?: Timers;
}

/** Binds the tooltip to `root`. Touch is ignored; a press hides the tooltip until the pointer leaves that link. Returns the unbind. */
export function bindLinkTooltip<El extends { closest: (selector: string) => El | null }>(root: LinkRoot, o: LinkTooltipOptions<El>): () => void {
  const { restMs = 250, graceMs = 300, timers = realTimers } = o;
  let current: El | null = null;
  let shown = false;
  let blocked: El | null = null;
  let pending: unknown;
  let grace: unknown;
  const hide = (): void => {
    timers.clear(pending);
    current = null;
    if (!shown) return;
    shown = false;
    o.close();
    timers.clear(grace);
    grace = timers.set(() => {
      grace = undefined;
    }, graceMs);
  };
  const linkOf = (e: LinkPointerEvent): El | null => {
    const t = e.target as { closest?: unknown } | null;
    return t !== null && typeof t.closest === 'function' ? (t as El).closest(o.selector) : null;
  };
  const move = (e: LinkPointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const link = linkOf(e);
    if (link === null || o.read(link) === null) {
      blocked = null;
      hide();
      return;
    }
    if (link === blocked || link === current) return;
    hide();
    current = link;
    const id = o.read(link) as string;
    const go = (): void => {
      shown = true;
      o.open(id, link);
    };
    if (grace !== undefined) go();
    else pending = timers.set(go, restMs);
  };
  const down = (e: LinkPointerEvent): void => {
    const link = linkOf(e);
    if (link === null) return;
    blocked = link;
    hide();
  };
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerdown', down);
  return () => {
    hide();
    timers.clear(grace);
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerdown', down);
  };
}
