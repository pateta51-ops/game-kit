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
  querySelectorAll?: (selector: string) => ArrayLike<unknown>;
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
  /** True while something else owns the keys (e.g. `() => help.getState().open` of bindPlayKeys): nothing runs, whatever the bind order. */
  paused?: () => boolean;
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

export const isTyping = (target: unknown): boolean =>
  (target as { isContentEditable?: unknown } | null)?.isContentEditable === true ||
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag(target));

export const isControl = (target: unknown): boolean => {
  if (['BUTTON', 'A', 'SUMMARY'].includes(tag(target))) return true;
  const get = (target as { getAttribute?: unknown } | null)?.getAttribute;
  return typeof get === 'function' && (get as (n: string) => unknown).call(target, 'role') === 'button';
};

/** Hidden, inert and aria-hidden ancestors do not own keyboard input. */
export function isActiveElement(node: unknown): boolean {
  if (node == null) return false;
  const el = node as Element;
  if (typeof el.closest !== 'function') return true;
  if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const view = el.ownerDocument?.defaultView;
  if (view) for (let at: Element | null = el; at; at = at.parentElement) {
    const style = view.getComputedStyle(at);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  return true;
}

/** The last active matching overlay in document order; custom selectors keep the same visibility rules. */
export function activeOverlay(root: KeyRoot, selector = '[role="dialog"], [role="alertdialog"]'): unknown {
  const nodes = root.querySelectorAll ? Array.from(root.querySelectorAll(selector)) : [root.querySelector(selector)];
  return nodes.findLast(isActiveElement) ?? null;
}

export function activeModal(root: KeyRoot): unknown {
  return activeOverlay(root, '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]');
}

export function deepActiveElement(root: Document): Element | null {
  let active = root.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

export function composedContains(container: Element, node: Element): boolean {
  for (let at: Element | null = node; at;) {
    if (at === container) return true;
    const root = at.getRootNode();
    at = at.assignedSlot ?? at.parentElement ?? ('host' in root ? (root as ShadowRoot).host : null);
  }
  return false;
}

/** Returns the unbind. */
export function bindPromptKeys(target: KeyTarget, options: PromptKeysOptions): () => void {
  const { overlay, keys = {} } = options;
  const fn: KeyListener = (e) => {
    if (e.defaultPrevented || options.paused?.() === true || !options.open()) return;
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (activeOverlay(target, overlay) != null) return;
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
