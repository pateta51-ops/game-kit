import { describe, expect, it } from 'vitest';
import { bindPlayKeys, bindPromptKeys, type KeyPress, type KeyTarget, createShortcutHelp, shortcutHelpElement, type FocusItem, type HelpNode, type PlayKeyPress, type PlayKeysOptions } from './index.ts';

function setup(options: Partial<PlayKeysOptions> = {}) {
  const listeners = new Set<(e: PlayKeyPress) => void>();
  const log: string[] = [];
  const items: FocusItem[] = ['a', 'b', 'c'].map((n) => ({ focus: () => void log.push(`focus ${n}`) }));
  const list = { querySelectorAll: () => items };
  for (const i of items) i.closest = () => list;
  const confirm = { disabled: false, click: () => void log.push('confirm') };
  const help = createShortcutHelp();
  const unbind = bindPlayKeys(
    {
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
      querySelector: () => null,
    },
    { panel: () => ({ querySelector: () => confirm }), board: { e: () => void log.push('end') }, help, ...options },
  );
  const press = (key: string, more: Partial<PlayKeyPress> = {}): boolean => {
    let prevented = false;
    const e: PlayKeyPress = {
      key, target: null, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false,
      preventDefault: () => { prevented = true; }, ...more,
    };
    for (const fn of listeners) fn(e);
    return prevented;
  };
  return { press, log, items, confirm, help, listeners, unbind };
}

describe('bindPlayKeys', () => {
  it('Enter clicks the confirm control, not on a button or a disabled one', () => {
    const s = setup();
    expect(s.press('Enter')).toBe(true);
    expect(s.press('Enter', { target: { tagName: 'BUTTON' } })).toBe(false);
    s.confirm.disabled = true;
    expect(s.press('Enter')).toBe(false);
    expect(s.log).toEqual(['confirm']);
  });
  it('arrows move focus through the marked list and wrap', () => {
    const s = setup();
    s.press('ArrowDown', { target: s.items[2] });
    s.press('ArrowUp', { target: s.items[0] });
    s.press('ArrowRight', { target: s.items[0] });
    expect(s.log).toEqual(['focus a', 'focus c', 'focus b']);
    expect(s.press('ArrowDown', { target: {} })).toBe(false);
  });
  it('a board key fires in either case, and is ignored while typing or with a modifier', () => {
    const s = setup();
    expect(s.press('E')).toBe(true);
    s.press('e', { target: { tagName: 'INPUT' } });
    s.press('e', { target: { isContentEditable: true } });
    s.press('e', { ctrlKey: true });
    expect(s.log).toEqual(['end']);
  });
  it('? opens the help, Escape closes it, and board keys wait meanwhile', () => {
    const s = setup();
    s.press('?');
    expect(s.help.getState().open).toBe(true);
    s.press('e');
    expect(s.log).toEqual([]);
    s.press('Escape');
    expect(s.help.getState().open).toBe(false);
  });
  it('unbind removes the listener', () => {
    const s = setup();
    s.unbind();
    expect(s.listeners.size).toBe(0);
  });
  it('ignores key repeat, enabled=false, and an open dialog', () => {
    const s = setup();
    s.press('e', { repeat: true });
    expect(s.log).toEqual([]);
    const off = setup({ enabled: () => false });
    off.press('e');
    expect(off.log).toEqual([]);
    const dlg = setup();
    dlg.unbind();
    const l = new Set<(e: PlayKeyPress) => void>();
    const log: string[] = [];
    bindPlayKeys(
      { addEventListener: (_, f) => l.add(f), removeEventListener: () => undefined, querySelector: () => ({}) },
      { board: { e: () => void log.push('end') } },
    );
    for (const f of l) f({ key: 'e', target: null, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => undefined });
    expect(log).toEqual([]);
  });
  it('skips disabled items through the item selector', () => {
    let asked = '';
    const items: FocusItem[] = [{ focus: () => undefined }];
    const s = setup();
    s.unbind();
    const l = new Set<(e: PlayKeyPress) => void>();
    bindPlayKeys(
      { addEventListener: (_, f) => l.add(f), removeEventListener: () => undefined, querySelector: () => null },
      {},
    );
    items[0]!.closest = () => ({ querySelectorAll: (sel) => ((asked = sel), items) });
    for (const f of l) f({ key: 'ArrowDown', target: items[0], defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => undefined });
    expect(asked).toContain(':not([disabled])');
  });
  it('rejects reserved board keys', () => {
    for (const k of ['1', 'Enter', '?', 'Escape', 'ArrowUp'])
      expect(() => setup({ board: { [k]: () => true } })).toThrow(/reserved/);
  });
  it('Escape closes the help first with bindPromptKeys on the same document, in both bind orders', () => {
    for (const playFirst of [true, false]) {
      const l: ((e: PlayKeyPress) => void)[] = [];
      const doc: KeyTarget = {
        addEventListener: (_, f) => l.push(f),
        removeEventListener: () => undefined,
        querySelector: () => null,
      };
      const help = createShortcutHelp();
      const back: string[] = [];
      const bindPlay = () => bindPlayKeys(doc, { help });
      const bindPrompt = () =>
        bindPromptKeys(doc, { open: () => true, panel: () => null, back: () => (back.push('back'), true), paused: () => help.getState().open });
      if (playFirst) {
        bindPlay();
        bindPrompt();
      } else {
        bindPrompt();
        bindPlay();
      }
      help.getState().show();
      let prevented = false;
      const e: KeyPress = {
        key: 'Escape', target: null, get defaultPrevented() { return prevented; }, ctrlKey: false, metaKey: false, altKey: false,
        preventDefault: () => { prevented = true; },
      };
      for (const f of l) f(e);
      expect(help.getState().open).toBe(false);
      expect(back).toEqual([]);
    }
  });
  it('shortcutHelpElement holds title and each row keys and text', () => {
    interface N { tag: string; text: string | null; attrs: Record<string, string>; kids: N[] }
    const node = (tag: string): HelpNode & N => {
      const n: HelpNode & N = { tag, text: null, attrs: {}, kids: [], get textContent() { return n.text; }, set textContent(v) { n.text = v; }, setAttribute: (k, v) => void (n.attrs[k] = v), append: (...k) => void n.kids.push(...(k as unknown as N[])) };
      return n;
    };
    const root = shortcutHelpElement({ createElement: node }, [{ keys: 'E', what: 'End phase' }, { keys: 'U', what: 'Undo' }], 'Keys') as unknown as N;
    const dump = (n: N): string[] => [n.text ?? '', ...n.kids.flatMap(dump)].filter(Boolean);
    expect(root.attrs.role).toBe('dialog');
    expect(dump(root)).toEqual(['Keys', 'E', 'End phase', 'U', 'Undo']);
  });
});
