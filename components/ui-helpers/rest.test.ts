import { describe, expect, it } from 'vitest';
import {
  bindPromptKeys,
  compileIconWords,
  iconizeSegments,
  sheetMatching,
  sheetWords,
  withoutIconWords,
  type IconSegment,
  type KeyPress,
  type KeyTarget,
  type PromptKeysOptions,
  type Segment,
  type SheetBlock,
} from './index.ts';

// A tiny fake game: coins, coin tokens with a value, runes with a letter (X or Y), a gate, and a card named "Coin Toss".
const IDS: Record<string, string> = { coin: 'coin', 'coin token': 'coin-token', rune: 'rune', gate: 'gate' };

function match(text: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const m of text.matchAll(/\[([A-Z]+)\]|\b(coin token|coin|rune|gate)s?\b/gi)) {
    if (m.index > at) out.push({ kind: 'text', text: text.slice(at, m.index) });
    const code = m[1];
    if (code !== undefined) out.push({ kind: 'icon', code, raw: m[0], id: IDS[code.toLowerCase()] ?? null });
    else out.push({ kind: 'term', text: m[0], id: IDS[(m[2] ?? '').toLowerCase()] ?? '' });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });
  return out;
}

const TABLE = compileIconWords(
  {
    rules: [
      { entry: 'coin', icon: 'coin', style: 'coin' },
      { entry: 'coin-token', before: 'value-{n} ', icon: 'coin-token:{n}', style: 'coin-token-{n}' },
      { entry: 'rune', after: ' ({L})', icon: 'rune:{L}', style: 'rune-{L}' },
      { entry: 'gate', words: 'Gate', case: true, icon: 'gate', style: 'gate' },
    ],
  },
  ['Coin Toss', ''],
  'XYxy',
);

const icons = (text: string, lead: string[] = []): IconSegment[] => iconizeSegments(TABLE, text, match(text), lead);

const show = (text: string, lead: string[] = []): string =>
  icons(text, lead)
    .map((s) => (s.kind === 'iconWord' ? `[${s.code}|${s.text}]` : s.kind === 'icon' ? s.raw : s.text))
    .join('');

describe('icon words', () => {
  it('replaces singular and plural words, keeping the number', () => {
    expect(show('Pay 2 coins')).toBe('Pay 2 [coin|coins]');
    expect(show('Counts as one coin.')).toBe('Counts as one [coin|coin].');
  });

  it('takes the words before a link into the icon, with their digit', () => {
    expect(show('Gain a value-2 coin token.')).toBe('Gain a [coin-token:2|value-2 coin token].');
    expect(icons('Gain a value-2 coin token.').find((s) => s.kind === 'iconWord')).toMatchObject({
      id: 'coin-token',
      style: 'coin-token-2',
    });
  });

  it('keeps the words when the rule needs a value the text does not give', () => {
    expect(show('Discard a coin token.')).toBe('Discard a coin token.');
  });

  it('takes the words after a link into the icon, with one of the game letters', () => {
    expect(show('a rune (x) and a rune (Q)')).toBe('a [rune:X|rune (x)] and a rune (Q)');
  });

  it('matches exactly as written when the rule says so', () => {
    expect(show('Gate opened; the gate, Gates')).toBe('[gate|Gate] opened; the gate, Gates');
  });

  it('never replaces words inside a proper name', () => {
    expect(show('Coin Toss played; 1 coin')).toBe('Coin Toss played; 1 [coin|coin]');
  });

  it('keeps the words when the line is already led by that icon', () => {
    expect(show('Pay 2 coins', ['coin'])).toBe('Pay 2 coins');
    expect(show('Pay 2 coins', ['gate'])).toBe('Pay 2 [coin|coins]');
  });

  it('writes a printed icon followed by its own word once, as the icon', () => {
    expect(withoutIconWords('[COIN] coin: 2, [GATE] coin', match)).toBe('[COIN]: 2, [GATE] coin');
  });
});

const SHEET: SheetBlock[] = [
  { level: 1, text: 'Setup' },
  { text: 'Deal 5 cards. Hand limit is 7.' },
  { level: 2, text: 'Trading [COIN_TOKEN]' },
  { text: 'Swap goods.' },
  { text: 'Pay **two** coins.' },
  { level: 1, text: 'Scoring' },
  { level: 2, text: 'End of game' },
  { text: 'Count the hand.' },
];
const found = (q: string): number[] => [...sheetMatching(SHEET, q)].sort((a, b) => a - b);

describe('rule sheet search', () => {
  it('a blank search shows the whole sheet', () => {
    expect(found('  ')).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('a word shows the blocks that hold it and every heading above them', () => {
    expect(found('hand')).toEqual([0, 1, 5, 6, 7]);
    expect(found('TWO coins')).toEqual([0, 2, 4]);
  });

  it('every word must be there, and nonsense finds nothing', () => {
    expect(found('hand limit')).toEqual([0, 1]);
    expect(found('zzqqxx')).toEqual([]);
  });

  it('a heading that matches shows its whole section, and an icon is found by its word', () => {
    expect(sheetWords('Take a [COIN_TOKEN]')).toContain('coin token');
    expect(found('coin token')).toEqual([0, 2, 3, 4]);
    expect(found('scoring')).toEqual([5, 6, 7]);
  });

  it('reads the text the way the game says, and never finds a rule id', () => {
    expect([...sheetMatching([{ text: 'Pay {c}' }], 'coin', (t) => t.replace('{c}', 'coin'))]).toEqual([0]);
    const withIds = [{ text: 'Deal 5 cards.', src: 'R-001' }];
    expect(sheetMatching(withIds, 'r-001').size).toBe(0);
  });
});

function keyboard(options: Partial<PromptKeysOptions> = {}) {
  const listeners = new Set<(e: KeyPress) => void>();
  const clicks: string[] = [];
  const state = { overlay: false, open: true };
  const buttons: Record<string, { disabled?: boolean; click: () => void }> = {
    '[data-shortcut="1"]': { click: () => clicks.push('1') },
    '[data-shortcut="2"]': { disabled: true, click: () => clicks.push('2') },
    '#end': { click: () => clicks.push('end') },
  };
  const target: KeyTarget = {
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
    querySelector: () => (state.overlay ? {} : null),
  };
  const unbind = bindPromptKeys(target, {
    open: () => state.open,
    panel: () => ({ querySelector: (s) => buttons[s] ?? null }),
    ...options,
  });
  const press = (key: string, more: Partial<KeyPress> = {}): boolean => {
    let prevented = false;
    const e: KeyPress = {
      key,
      target: null,
      defaultPrevented: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: () => {
        prevented = true;
      },
      ...more,
    };
    for (const fn of listeners) fn(e);
    return prevented;
  };
  return { press, clicks, state, unbind };
}

describe('prompt keys', () => {
  it('document is a key target', () => {
    const ok: Document extends KeyTarget ? true : false = true;
    expect(ok).toBe(true);
  });

  it('1-9 press the numbered button, unless it is missing or disabled', () => {
    const k = keyboard();
    expect(k.press('1')).toBe(true);
    expect(k.press('2')).toBe(false);
    expect(k.press('3')).toBe(false);
    expect(k.clicks).toEqual(['1']);
  });

  it('leaves alone keys typed into a field, with a modifier, under an overlay, already handled, or with no prompt', () => {
    const k = keyboard();
    expect(k.press('1', { target: { tagName: 'INPUT' } })).toBe(false);
    expect(k.press('1', { target: { isContentEditable: true } })).toBe(false);
    expect(k.press('1', { ctrlKey: true })).toBe(false);
    expect(k.press('1', { defaultPrevented: true })).toBe(false);
    k.state.overlay = true;
    expect(k.press('1')).toBe(false);
    k.state.overlay = false;
    k.state.open = false;
    expect(k.press('1')).toBe(false);
    expect(k.clicks).toEqual([]);
  });

  it('Escape clears first, then answers Back, and does nothing when the game has neither', () => {
    const said: string[] = [];
    let picked = true;
    const k = keyboard({
      clear: () => {
        if (!picked) return false;
        picked = false;
        said.push('clear');
        return true;
      },
      back: () => {
        said.push('back');
        return true;
      },
    });
    expect(k.press('Escape')).toBe(true);
    expect(k.press('Escape')).toBe(true);
    expect(said).toEqual(['clear', 'back']);
    expect(keyboard().press('Escape')).toBe(false);
    expect(keyboard({ back: () => false }).press('Escape')).toBe(false);
  });

  it("runs the game's keys in both cases and tells them when the focus is on a control", () => {
    const seen: boolean[] = [];
    const k = keyboard({
      keys: {
        e: ({ press }) => press('#end'),
        Enter: ({ onControl }) => {
          seen.push(onControl);
          return !onControl;
        },
      },
    });
    expect(k.press('e')).toBe(true);
    expect(k.press('E')).toBe(true);
    expect(k.clicks).toEqual(['end', 'end']);
    expect(k.press('Enter')).toBe(true);
    expect(k.press('Enter', { target: { tagName: 'button' } })).toBe(false);
    expect(k.press('Enter', { target: { tagName: 'DIV', getAttribute: () => 'button' } })).toBe(false);
    expect(seen).toEqual([false, true, true]);
    expect(k.press('toString')).toBe(false);
  });

  it('stops after the unbind', () => {
    const k = keyboard();
    k.unbind();
    expect(k.press('1')).toBe(false);
  });
});
