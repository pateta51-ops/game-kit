import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { edgesOf } from '../state-machines/machine';
import {
  bare,
  bottomPadding,
  cssBlocks,
  DOCK_MACHINE,
  dockKey,
  dockState,
  dockToggle,
  dockWantsOpen,
  evalLength,
  fixPlurals,
  lead,
  phoneLayerCheck,
  pickTabs,
  shortPrompt,
} from './index';

const P = ":root[data-layout='phone']";
const GAME_CSS = `
/* .gone { position: fixed; bottom: 0; } */
${P} { --p-h: 100dvh; }
${P} .bar { position: fixed; left: 0; bottom: 0; }
${P} .ok { position: fixed; top: 0; height: var(--p-h); bottom: auto; }
${P} .full { position: fixed; inset: 0; height: var(--p-h); }
${P} .dlg { bottom: 12px; }
${P} .tall { min-height: 100dvh; }
${P} .inner { position: absolute; bottom: 0; padding-bottom: 4px; }
.desk { position: fixed; bottom: 0; height: 50vh; }
@media (max-height: 600px) {
  ${P} .low { position: fixed; top: 0; bottom: 0; }
}
`;
const src = [{ file: 'game.css', css: GAME_CSS }];

describe('phoneLayerCheck', () => {
  it('names fixed layers sized by bottom, also inside an at-rule; leaves sized, unanchored, absolute and out-of-scope rules', () => {
    const r = phoneLayerCheck(src, { heightVar: '--p-h' });
    expect(r.unsized).toEqual([`game.css: ${P} .bar`, `game.css: ${P} .low`]);
    expect(r.directUnits).toEqual([`game.css: ${P} .tall`]);
    expect(r.guarded).toBe(2);
  });
  it('fixedBase adds a class fixed by a rule outside the scope; allow leaves a selector out', () => {
    const r = phoneLayerCheck(src, { heightVar: '--p-h', fixedBase: ['.dlg'], allow: [`${P} .bar`, `${P} .tall`] });
    expect(r.unsized).toEqual([`game.css: ${P} .dlg`, `game.css: ${P} .low`]);
    expect(r.directUnits).toEqual([]);
  });
  it("scope '' checks every rule; the default height variable is the kit's", () => {
    const r = phoneLayerCheck(src, { scope: '' });
    expect(r.unsized).toContain('game.css: .desk');
    expect(r.unsized).toContain(`game.css: ${P} .full`);
    expect(r.directUnits).toContain('game.css: .desk');
    expect(r.guarded).toBe(0);
  });
  it('no sources, an empty sheet, a sheet of comments: nothing found', () => {
    const none = {
      unsized: [],
      directUnits: [],
      guarded: 0,
      faults: ["no rule with height: var(--pm-h) in scope data-layout='phone': nothing was guarded"],
    };
    expect(phoneLayerCheck([])).toEqual(none);
    expect(phoneLayerCheck([{ file: 'a.css', css: '' }, { file: 'b.css', css: '/* .a { bottom: 0 } */' }])).toEqual(none);
    expect(cssBlocks([{ file: 'a.css', css: 'not css' }])).toEqual([]);
  });
  const check = (css: string) => phoneLayerCheck([{ file: 't.css', css }], { heightVar: '--p-h' });
  const layer = (decls: string) => check(`${P} .x { position: fixed; height: var(--p-h); ${decls} }`).unsized.length;
  it('review 1: only a zero top is sized (0, 0px, with !important, at the end of the rule)', () => {
    expect(layer('bottom: 0; top: 0.5rem;')).toBe(1);
    expect(layer('bottom: 0; top: 05px;')).toBe(1);
    expect(layer('bottom: 0; top: 0px;')).toBe(0);
    expect(layer('bottom: 0; top: 0 !important;')).toBe(0);
    expect(layer('bottom: 0; top:0')).toBe(0);
  });
  it('review 2: the inset shorthand is read by its top and bottom values', () => {
    expect(layer('inset: 0;')).toBe(0);
    expect(layer('inset: 0 auto;')).toBe(0);
    expect(layer('inset: auto 0;')).toBe(0);
    expect(layer('inset: 0 0 auto;')).toBe(0);
    expect(layer('inset: 8px 0 0;')).toBe(1);
    expect(layer('inset: auto 0 0 0;')).toBe(1);
    expect(layer('inset: 8px 0 auto 0;')).toBe(0);
    expect(layer('inset: calc(1px + 2px) 0 0;')).toBe(1);
    expect(layer('inset: 8px; top: 0;')).toBe(0);
    expect(check(`${P} .x { position: fixed; inset: 0 0 12px 0; }`).unsized).toHaveLength(1);
  });
  it('review 3: double quotes in the selector or the scope are the same scope; nothing guarded is a fault', () => {
    const css = ':root[data-layout="phone"]  .bar { position: fixed; bottom: 0 }';
    const r = check(css);
    expect(r.unsized).toEqual([`t.css: ${P} .bar`]);
    expect(r.faults).toHaveLength(2);
    expect(r.faults[1]).toContain('nothing was guarded');
    expect(phoneLayerCheck([{ file: 't.css', css }], { scope: 'data-layout="phone"', allow: [css.split(' {')[0] ?? ''] }).unsized).toEqual([]);
    expect(check(`${P} .ok { position: fixed; top: 0; bottom: 0; height: var(--p-h) }`).faults).toEqual([]);
    expect(check('.other { position: fixed; bottom: 0 }').faults).toHaveLength(1);
  });
  it('review 4: a nested rule is checked under its parent, and the parent keeps its own declarations', () => {
    const r = check(`
      ${P} {
        --p-h: 100dvh;
        .bar { position: fixed; bottom: 0; }
        &.tall .ok { position: fixed; top: 0; bottom: 0; height: var(--p-h); }
        @media (max-height: 600px) { .low { position: fixed; bottom: 0; } }
      }
      ${P} .outer { position: fixed; bottom: 0; .in { color: red; } }`);
    expect(r.unsized).toEqual([`t.css: ${P} .bar`, `t.css: ${P} .low`, `t.css: ${P} .outer`]);
    expect(r.directUnits).toEqual([]);
    expect(r.guarded).toBe(1);
    expect(cssBlocks([{ file: 'f', css: '.a { .b { x: 1 } &:hover { y: 2 } z: 3 }' }]).map((b) => b.selector)).toEqual([
      '.a .b',
      '.a:hover',
      '.a',
    ]);
  });
  it("the kit's own stylesheet passes", () => {
    const css = readFileSync(fileURLToPath(new URL('./phone-mode.css', import.meta.url)), 'utf8');
    const r = phoneLayerCheck([{ file: 'phone-mode.css', css }], { scope: '' });
    expect(r.unsized).toEqual([]);
    expect(r.directUnits).toEqual([]);
    expect(r.guarded).toBe(2);
    expect(bottomPadding(css, ':where(.kit-pm-sheet-body:last-child)', 0)).toBe(12);
    expect(bottomPadding(css, ':where(.kit-pm-sheet-body:last-child)', 34)).toBe(46);
  });
});

describe('evalLength, bottomPadding', () => {
  it('px, 0, sums, max, min, calc, nested', () => {
    expect(evalLength('12px')).toBe(12);
    expect(evalLength(' 0 ')).toBe(0);
    expect(evalLength('8px + 4px - 2.5px')).toBe(9.5);
    expect(evalLength('max(8px, calc(34px - 16px))')).toBe(18);
    expect(evalLength('max(8px, calc(0px - 16px))')).toBe(8);
    expect(evalLength('min(4px, max(1px, 2px))')).toBe(2);
    expect(() => evalLength('1em')).toThrow('cannot read 1em');
    expect(() => evalLength('')).toThrow();
  });
  it('the last padding-bottom of the nth rule, the inset substituted for env() and the variable', () => {
    const css = `
      .tabs { padding-bottom: 99px; padding-bottom: max(8px, calc(env(safe-area-inset-bottom, 0px) - 16px)); }
      .foot { padding-bottom: calc(var(--inset, 0px) + 6px) }
      @media (max-height: 600px) { .tabs { padding-bottom: 2px; } }
      .none { padding: 0; }`;
    expect(bottomPadding(css, '.tabs', 0)).toBe(8);
    expect(bottomPadding(css, '.tabs', 34)).toBe(18);
    expect(bottomPadding(css, '.tabs', 34, 1)).toBe(2);
    expect(bottomPadding(css, '.foot', 34, 0, '--inset')).toBe(40);
    expect(() => bottomPadding(css, '.tabs', 0, 2)).toThrow('no .tabs rule number 3');
    expect(() => bottomPadding(css, '.none', 0)).toThrow('.none has no padding-bottom');
    expect(() => bottomPadding('', '.tabs', 0)).toThrow('no .tabs rule number 1');
  });
});

describe('the decision dock', () => {
  const board = new Set(['a', 'b']);
  const one = { options: [{ ref: 'a' }, { ref: 'b' }] };
  it('no decision: folded; a pick of one thing a tap answers: folded', () => {
    expect(dockWantsOpen(null, board)).toBe(false);
    expect(dockWantsOpen(one, board)).toBe(false);
    expect(dockWantsOpen({ ...one, min: 1, max: 1, canDecline: false, picked: 0 }, board)).toBe(false);
  });
  it('opens for a button of its own, several picks, a tick, an option off the board or without a ref, no options', () => {
    expect(dockWantsOpen({ ...one, canDecline: true }, board)).toBe(true);
    expect(dockWantsOpen({ ...one, min: 0, max: 3 }, board)).toBe(true);
    expect(dockWantsOpen({ ...one, min: 0 }, board)).toBe(true);
    expect(dockWantsOpen({ ...one, picked: 1 }, board)).toBe(true);
    expect(dockWantsOpen({ options: [{ ref: 'a' }, { ref: 'z' }] }, board)).toBe(true);
    expect(dockWantsOpen({ options: [{ ref: 'a' }, {}] }, board)).toBe(true);
    expect(dockWantsOpen({ options: [] }, board)).toBe(true);
    expect(dockWantsOpen(one, new Set())).toBe(true);
  });
  it('boardOnly keeps it folded whatever the options; a pending follow-up opens it even then', () => {
    expect(dockWantsOpen({ options: [], boardOnly: true }, board)).toBe(false);
    expect(dockWantsOpen({ options: [], boardOnly: true, pending: true }, board)).toBe(true);
  });
  it("the player's choice holds while the key is the same, and is dropped when the decision or what it wants changes", () => {
    const k1 = dockKey('d1', false);
    expect(dockState(false, k1, null)).toBe('folded');
    const opened = dockToggle(false, k1, null);
    expect(opened).toEqual({ key: k1, state: 'open' });
    expect(dockState(false, k1, opened)).toBe('open');
    expect(dockToggle(false, k1, opened)).toEqual({ key: k1, state: 'folded' });
    expect(dockState(true, dockKey('d1', true), opened)).toBe('open');
    const folded = dockToggle(true, dockKey('d1', true), opened);
    expect(folded.state).toBe('folded');
    expect(dockState(true, dockKey('d2', true), folded)).toBe('open');
    expect(dockState(true, dockKey('d1', true, ['x', 2]), folded)).toBe('open');
  });
  it('dockKey: the decision, what it wants, the parts; no decision has a key too', () => {
    expect(dockKey('d1', true, ['a,b', 2, false])).toBe('d1|open|a,b|2|false');
    expect(dockKey(null, false)).toBe('-|fold');
    expect(edgesOf(DOCK_MACHINE)).toHaveLength(2);
  });
  it('pickTabs: the tabs of the picked things, none for a thing on no tab or for no picks', () => {
    const tabOf = (id: string) => (id.startsWith('s') ? 'shop' : id.startsWith('m') ? 'mine' : null);
    expect([...pickTabs(['s1', 'm1', 's2', 'x'], tabOf)]).toEqual(['shop', 'mine']);
    expect(pickTabs([], tabOf).size).toBe(0);
    expect(pickTabs(new Map([['x', 1]]).keys(), tabOf).size).toBe(0);
  });
});

describe('shortPrompt', () => {
  type Kind = 'pay' | 'pick' | 'wait';
  interface Prompt {
    kind: Kind;
    message: string;
  }
  const table: Record<Kind, (p: Prompt) => string> = {
    pay: (p) => lead(p.message, [': choose how']) ?? 'Choose how to pay',
    pick: (p) => fixPlurals(p.message),
    wait: () => '',
  };
  const full = (p: Prompt) => p.message;
  it('one line per kind, without the full stop', () => {
    expect(shortPrompt(table, { kind: 'pay', message: 'Pay 2 wood: choose how to pay.' })).toBe('Pay 2 wood');
    expect(shortPrompt(table, { kind: 'pay', message: 'Settle up.' })).toBe('Choose how to pay');
    expect(shortPrompt(table, { kind: 'pick', message: 'Choose 2 tile(s)\n to flip.' })).toBe('Choose 2 tiles to flip');
    expect(shortPrompt(table, { kind: 'pick', message: 'Choose 1 tile(s).' })).toBe('Choose 1 tile');
  });
  it('an empty line or a kind missing at run time gives the fallback; with no fallback, an empty line', () => {
    expect(shortPrompt(table, { kind: 'wait', message: 'The rival moves. ' }, full)).toBe('The rival moves');
    expect(shortPrompt(table, { kind: 'new' as Kind, message: 'Something new.' }, full)).toBe('Something new');
    expect(shortPrompt(table, { kind: 'wait', message: 'x' })).toBe('');
  });
  it('bare, lead, fixPlurals on empty and odd input', () => {
    expect(bare('')).toBe('');
    expect(bare('  Go on...  ')).toBe('Go on');
    expect(lead(': choose how', [': choose how'])).toBeNull();
    expect(lead('abc', [])).toBeNull();
    expect(lead('a - b / c', [' / ', ' - '])).toBe('a - b');
    expect(fixPlurals('no count(s)')).toBe('no count(s)');
  });
  it('review 5: several words after the number; the nearest number decides; only a plain s is added', () => {
    expect(fixPlurals('Take 2 red tile(s) and 1 old coin(s)')).toBe('Take 2 red tiles and 1 old coin');
    expect(fixPlurals('Choose 1 of 3 card(s)')).toBe('Choose 1 of 3 cards');
    expect(fixPlurals('Lose 0 life-point(s)')).toBe('Lose 0 life-points');
    expect(fixPlurals('Raze 2 city(s), 1 city(s)')).toBe('Raze 2 citys, 1 city');
    expect(fixPlurals('Pay 2. Then card(s)')).toBe('Pay 2. Then card(s)');
  });
  it('review 6: a kind named like an inherited property finds no entry', () => {
    for (const kind of ['toString', 'constructor', '__proto__'])
      expect(shortPrompt(table, { kind: kind as Kind, message: 'Full.' }, full)).toBe('Full');
  });
});
