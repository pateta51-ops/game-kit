// Ported from unst src/ui/play/useBoardKeys.ts + ShortcutHelp.tsx and ufs src/ui/prompts/common.tsx (arrow lists), no React.
// Enter confirms, arrows rove through a marked option list, the game's board keys run, `?` opens a key list, Escape closes it.
import { createStore, type StoreApi } from 'zustand/vanilla';
import { activeOverlay, isControl, isTyping, keyOrigin, type KeyPress, type KeyRoot, type KeyTarget } from './promptKeys.ts';

export interface PlayKeyPress extends KeyPress {
  repeat?: boolean;
}

export interface FocusItem {
  focus: () => void;
  closest?: (selector: string) => ListElement | null;
}
export interface ListElement {
  querySelectorAll: (selector: string) => ArrayLike<FocusItem>;
}

export interface ShortcutRow {
  keys: string;
  what: string;
}

export interface ShortcutHelpState {
  open: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
}

/** The overlay's open flag; the game draws it from rows (or `shortcutHelpElement`). */
export function createShortcutHelp(): StoreApi<ShortcutHelpState> {
  return createStore<ShortcutHelpState>((set) => ({
    open: false,
    show: () => {
      set({ open: true });
    },
    hide: () => {
      set({ open: false });
    },
    toggle: () => {
      set((s) => ({ open: !s.open }));
    },
  }));
}

export interface PlayKeysOptions {
  /** Keys are live. */
  enabled?: () => boolean;
  /** The element holding the done/confirm control. */
  panel?: () => KeyRoot | null;
  /** The confirm control inside the panel. */
  confirm?: string;
  /** Marks a list of options; arrows move focus between its items. */
  list?: string;
  /** What in a list can take focus. */
  item?: string;
  /** The game's board keys by `event.key` (letters match both cases); return false when nothing was done. */
  board?: Readonly<Record<string, () => boolean | void>>;
  /** `?` opens this; Escape (or `?`) closes it. */
  help?: StoreApi<ShortcutHelpState>;
  /** Elements that own the keys while present. */
  overlay?: string;
}

const ARROWS: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

const RESERVED = /^([1-9]|Enter|Escape|\?)$/;

/** Returns the unbind. Throws when `board` maps a reserved key (1-9, Enter, Escape, ?, arrows). */
export function bindPlayKeys(target: KeyTarget, o: PlayKeysOptions): () => void {
  const { confirm = '[data-confirm]', list = '[data-key-list]', item = 'button:not([disabled])', overlay } = o;
  for (const k of Object.keys(o.board ?? {}))
    if (RESERVED.test(k) || k in ARROWS) throw new Error(`bindPlayKeys: board key "${k}" is reserved`);
  const fn = (e: PlayKeyPress): void => {
    if (e.defaultPrevented || e.repeat === true || o.enabled?.() === false) return;
    const origin = keyOrigin(e);
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(origin)) return;
    const key = e.key;
    if (o.help?.getState().open === true) {
      if (key === 'Escape' || key === '?') {
        o.help.getState().hide();
        e.preventDefault();
      }
      return;
    }
    if (activeOverlay(target, overlay) != null) return;
    if (key === '?' && o.help !== undefined) {
      o.help.getState().show();
      e.preventDefault();
      return;
    }
    const step = ARROWS[key];
    if (step !== undefined) {
      const from = (e.target as FocusItem | null)?.closest?.(list);
      if (from == null) return;
      const items = Array.from(from.querySelectorAll(item));
      if (items.length === 0) return;
      const at = items.indexOf(e.target as FocusItem);
      items[at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length]?.focus();
      e.preventDefault();
      return;
    }
    if (key === 'Enter') {
      if (isControl(origin)) return;
      const b = o.panel?.()?.querySelector(confirm) as { disabled?: unknown; click?: unknown } | null | undefined;
      if (b == null || b.disabled === true || typeof b.click !== 'function') return;
      (b.click as () => void).call(b);
      e.preventDefault();
      return;
    }
    const own = [key, key.toLowerCase()].find((k) => o.board !== undefined && Object.hasOwn(o.board, k));
    if (own !== undefined && o.board?.[own]?.() !== false) e.preventDefault();
  };
  target.addEventListener('keydown', fn);
  return () => {
    target.removeEventListener('keydown', fn);
  };
}

export interface HelpDoc {
  createElement: (tag: string) => HelpNode;
}
export interface HelpNode {
  textContent: string | null;
  setAttribute: (name: string, value: string) => void;
  append: (...nodes: HelpNode[]) => void;
}

/** An unstyled dialog listing the keys: a table of `<kbd>` and text. The game styles and mounts it. */
export function shortcutHelpElement(doc: HelpDoc, rows: readonly ShortcutRow[], title: string): HelpNode {
  const root = doc.createElement('div');
  root.setAttribute('role', 'dialog');
  root.setAttribute('data-kind', 'shortcut-help');
  const h = doc.createElement('h2');
  h.textContent = title;
  const table = doc.createElement('table');
  for (const r of rows) {
    const tr = doc.createElement('tr');
    const th = doc.createElement('th');
    const kbd = doc.createElement('kbd');
    kbd.textContent = r.keys;
    th.append(kbd);
    const td = doc.createElement('td');
    td.textContent = r.what;
    tr.append(th, td);
    table.append(tr);
  }
  root.append(h, table);
  return root;
}
