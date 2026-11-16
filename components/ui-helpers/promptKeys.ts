// Lifted from imp src/ui/a11y/shortcuts.ts: keys while a prompt is open. 1-9 press the panel's numbered button
// (`data-shortcut="1"`...); Escape clears a selection first, otherwise answers Back; every other key and its meaning is
// the game's. Keys typed into a field, with a modifier, or while an overlay is open (it has its own keys) are left alone.
export interface KeyPress {
  key: string;
  target: unknown;
  defaultPrevented: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
}

type KeyListener = (e: KeyPress) => void;

export interface KeyRoot {
  querySelector: (selector: string) => unknown;
}

/** `document` is one. */
export interface KeyTarget extends KeyRoot {
  addEventListener: (type: 'keydown', fn: KeyListener) => void;
  removeEventListener: (type: 'keydown', fn: KeyListener) => void;
}

export interface PromptKeyTools {
  /** Clicks the panel's button under the selector; false when there is none or it is disabled. */
  press: (selector: string) => boolean;
  /** The focus is on a button or a link, which has its own Enter and Space. */
  onControl: boolean;
}

export interface PromptKeysOptions {
  /** A prompt is open. */
  open: () => boolean;
  /** The element holding the prompt's buttons. */
  panel: () => KeyRoot | null;
  /** What has its own keys while it is there. */
  overlay?: string;
  /** The game's keys by `event.key` (a letter in lower case answers both cases); true when the key did something. */
  keys?: Readonly<Record<string, (tools: PromptKeyTools) => boolean>>;
  /** Escape, first: clears a selection or a confirmation; true when there was one. */
  clear?: () => boolean;
  /** Escape, otherwise: answers Back; true when the prompt allows it. */
  back?: () => boolean;
}

const tag = (target: unknown): string => {
  const t = (target as { tagName?: unknown } | null)?.tagName;
  return typeof t === 'string' ? t.toUpperCase() : '';
};

const isTyping = (target: unknown): boolean =>
  (target as { isContentEditable?: unknown } | null)?.isContentEditable === true ||
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag(target));

const isControl = (target: unknown): boolean => {
  if (['BUTTON', 'A'].includes(tag(target))) return true;
  const get = (target as { getAttribute?: unknown } | null)?.getAttribute;
  return typeof get === 'function' && (get as (n: string) => unknown).call(target, 'role') === 'button';
};

/** Returns the unbind. */
export function bindPromptKeys(target: KeyTarget, options: PromptKeysOptions): () => void {
  const { overlay = '[role="dialog"]', keys = {} } = options;
  const fn: KeyListener = (e) => {
    if (e.defaultPrevented || !options.open()) return;
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (target.querySelector(overlay) != null) return;
    const root = options.panel();
    if (root === null) return;
    const press = (selector: string): boolean => {
      const button = root.querySelector(selector) as { disabled?: unknown; click?: unknown } | null | undefined;
      if (button == null || button.disabled === true || typeof button.click !== 'function') return false;
      (button.click as () => void).call(button);
      return true;
    };
    const own = [e.key, e.key.toLowerCase()].find((k) => Object.hasOwn(keys, k));
    const done =
      own !== undefined
        ? keys[own]?.({ press, onControl: isControl(e.target) }) === true
        : /^[1-9]$/.test(e.key)
          ? press(`[data-shortcut="${e.key}"]`)
          : e.key === 'Escape' && (options.clear?.() === true || options.back?.() === true);
    if (done) e.preventDefault();
  };
  target.addEventListener('keydown', fn);
  return () => {
    target.removeEventListener('keydown', fn);
  };
}
