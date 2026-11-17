import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slots, zone } from '../board-layout/index.ts';
import { HTML, inline } from './build.mjs';
import { alignZones, cardFit, childrenOf, clampZoom, commonPrefix, consolidate, copyZones, distributeZones, keepPoint, layoutWarnings, mirrorZones, moveZone, normalizeDoc, parentOf, pileSize, renameZone, resizeZone, screenLayout, screenModes, snap, split, stageView, type Screen } from './index.ts';

const scr = (zones: Record<string, [number, number, number, number]>, w = 1000, h = 1000): Screen => ({ w, h, card: [100, 140], zones: Object.fromEntries(Object.entries(zones).map(([k, r]) => [k, { r }])) });

describe('K269 layout-editor logic', () => {
  it('normalizeDoc takes a doc, one layout or the older array form', () => {
    expect(normalizeDoc({ w: 390, h: 664, zones: { a: [1, 2, 3, 4] } })).toEqual({ screens: { main: { w: 390, h: 664, card: [180, 252], zones: { a: { r: [1, 2, 3, 4] } } } } });
    const d = normalizeDoc(JSON.stringify({ screens: { phone: { w: 10, h: 20, card: [2, 3], zones: { a: { r: [0, 0, 5, 5], label: 'Hand', cards: 3, fan: 'bad', locked: true }, b: 'x' } } } }));
    expect(d.screens.phone!.zones).toEqual({ a: { r: [0, 0, 5, 5], label: 'Hand', cards: 3, locked: true } });
    expect(Object.keys(normalizeDoc(null).screens)).toEqual(['desktop']);
  });
  it('normalizeDoc keeps unknown keys of screens and zones (review 3)', () => {
    const d = normalizeDoc({ screens: { s: { w: 10, h: 10, bg: 'x.png', zones: { a: { r: [0, 0, 1, 1], art: 'deck', cards: 'x' } } } } });
    expect(d.screens.s).toEqual({ bg: 'x.png', w: 10, h: 10, card: [180, 252], zones: { a: { r: [0, 0, 1, 1], art: 'deck' } } });
  });
  it('a screen is a board-layout zones layout', () => {
    const d = normalizeDoc({ screens: { desktop: { w: 100, h: 100, zones: { 'row.2': [50, 0, 10, 10], 'row.1': [0, 0, 10, 10] } } } });
    const L = screenLayout(d, 'desktop');
    expect(zone(L, 'row.1')).toEqual({ position: 'absolute', left: 0, top: 0, width: 10, height: 10 });
    expect(slots(L, 'row')).toEqual(['row.1', 'row.2']);
    expect(screenLayout(d, 'nope')).toBe(L);
  });
  it('children nest by id; move and resize carry them', () => {
    const s = scr({ you: [0, 500, 1000, 500], 'you.hand': [100, 600, 200, 100], 'you.hand.1': [100, 600, 50, 50], your: [0, 0, 1, 1] });
    expect(childrenOf({ screens: { d: s } }, 'd', 'you')).toEqual(['you.hand', 'you.hand.1']);
    expect(parentOf(s, 'you.hand.1')).toBe('you.hand');
    expect(parentOf(s, 'you.x.y')).toBe('you');
    expect(moveZone(s, 'you', 10, -10).zones['you.hand']!.r).toEqual([110, 590, 200, 100]);
    const r = resizeZone(s, 'you', [0, 500, 500, 250]);
    expect(r.zones['you.hand']!.r).toEqual([50, 550, 100, 50]);
    expect(r.zones.your!.r).toEqual([0, 0, 1, 1]);
    expect(resizeZone(s, 'you', [0, 500, 500, 250], true).zones['you.hand']!.r).toEqual([0, 525, 200, 100]);
  });
  it('mirror flips inside the stage, optionally into a new id', () => {
    const s = scr({ you: [0, 700, 1000, 300], 'you.hand': [100, 900, 200, 100] });
    const m = mirrorZones(s, ['you'], 'v', ['you', 'claude']);
    expect(m.zones.claude!.r).toEqual([0, 0, 1000, 300]);
    expect(m.zones['claude.hand']!.r).toEqual([100, 0, 200, 100]);
    expect(m.zones.you!.r).toEqual([0, 700, 1000, 300]);
    expect(mirrorZones(s, ['you.hand'], 'h').zones['you.hand']!.r).toEqual([700, 900, 200, 100]);
  });
  it('rename keeps the children and refuses a taken id', () => {
    const s = scr({ a: [0, 0, 1, 1], 'a.b': [0, 0, 1, 1], c: [0, 0, 1, 1] });
    expect(Object.keys(renameZone(s, 'a', 'x').zones)).toEqual(['x', 'x.b', 'c']);
    expect(renameZone(s, 'a', 'c')).toBe(s);
  });
  it('rename and mirror refuse an id whose branch exists (review 2)', () => {
    const s = scr({ a: [0, 0, 1, 1], 'a.b': [0, 0, 1, 1], 'c.x': [5, 5, 1, 1] });
    expect(renameZone(s, 'a', 'c')).toBe(s);
    expect(mirrorZones(s, ['a'], 'v', ['a', 'c'])).toBe(s);
    expect(Object.keys(mirrorZones(s, ['a'], 'v', ['a', 'd']).zones)).toEqual(['a', 'a.b', 'c.x', 'd', 'd.b']);
  });
  it('snap to edges and centres within tol, else to the grid', () => {
    const o: [number, number, number, number][] = [[100, 100, 100, 100]];
    expect(snap([203, 397, 50, 50], o, 16, 5)).toEqual({ r: [200, 400, 50, 50], guides: [{ axis: 'x', at: 200 }] });
    expect(snap([123, 503, 50, 50], o, 0, 5).r).toEqual([125, 503, 50, 50]);
    expect(snap([0, 0, 97, 50], o, 0, 5, 'r').r).toEqual([0, 0, 100, 50]);
    expect(snap([103, 0, 50, 50], o, 0, 5, 'l').r).toEqual([100, 0, 53, 50]);
  });
  it('cardFit by fan', () => {
    const z = { r: [0, 0, 400, 140] as [number, number, number, number] };
    expect(cardFit(z, [100, 140], 4, 'row')).toEqual({ fits: true, perRow: 4, scale: 1 });
    expect(cardFit(z, [100, 140], 5, 'row')).toEqual({ fits: false, perRow: 5, scale: 0.8 });
    expect(cardFit(z, [100, 140], 2, 'column').fits).toBe(false);
    expect(cardFit(z, [100, 140], 9, 'stack').fits).toBe(true);
    expect(cardFit({ r: [0, 0, 200, 280] }, [100, 140], 4, 'grid')).toEqual({ fits: true, perRow: 2, scale: 1 });
    expect(cardFit({ r: [0, 0, 200, 280] }, [100, 140], 6, 'grid').fits).toBe(false);
  });
  it('warnings: cards, overlapping siblings, outside the screen or parent', () => {
    const s = scr({ a: [0, 0, 500, 500], 'a.b': [400, 0, 200, 100], 'a.c': [450, 50, 20, 20], d: [900, 900, 200, 50] });
    s.zones.a = { ...s.zones.a!, cards: 9 };
    expect(layoutWarnings(s).map((w) => w.kind + ' ' + w.id)).toEqual(['cards a', 'outside a.b', 'overlap a.b', 'outside d']);
    s.zones.d = { ...s.zones.d!, hidden: true };
    expect(layoutWarnings(s).length).toBe(3);
  });
  it('align and distribute move whole zones', () => {
    const s = scr({ a: [0, 0, 10, 10], b: [50, 20, 20, 10], 'b.x': [50, 20, 5, 5], c: [100, 40, 10, 10] });
    expect(alignZones(s, ['a', 'b'], 'right').zones['a']!.r).toEqual([60, 0, 10, 10]);
    expect(alignZones(s, ['a', 'b'], 'top').zones['b.x']!.r).toEqual([50, 0, 5, 5]);
    const d = distributeZones({ ...s, zones: { ...s.zones, b: { r: [20, 20, 20, 10] } } }, ['c', 'a', 'b'], 'h');
    expect(d.zones.b!.r).toEqual([45, 20, 20, 10]);
  });
  it('K280 normalizeDoc keeps kind, full and the pile size; old docs load unchanged', () => {
    const d = normalizeDoc({ screens: { s: { w: 10, h: 10, pile: [40, '60'], zones: { a: { r: [0, 0, 1, 1], kind: 'pile', full: true }, b: { r: [0, 0, 1, 1], kind: 'bad', full: 1 } } } } });
    expect(d.screens.s).toEqual({ w: 10, h: 10, card: [180, 252], pile: [40, 60], zones: { a: { r: [0, 0, 1, 1], kind: 'pile', full: true }, b: { r: [0, 0, 1, 1] } } });
    expect(pileSize(normalizeDoc({ zones: {} }).screens.main!)).toEqual([90, 126]);
  });
  it('K280 warnings: a pile checks its tile, components and groups no cards', () => {
    const s = scr({ p: [0, 0, 50, 70], f: [100, 0, 60, 80], c: [200, 0, 10, 10], g: [300, 0, 10, 10] });
    Object.assign(s.zones.p!, { kind: 'pile' }); Object.assign(s.zones.f!, { kind: 'pile', full: true }); Object.assign(s.zones.c!, { kind: 'component', cards: 3 }); Object.assign(s.zones.g!, { kind: 'group', cards: 3 });
    expect(layoutWarnings(s).map((w) => w.id)).toEqual(['f']);
  });
  it('K280 consolidate three piles into <prefix>.piles, then split them back', () => {
    const s = scr({ you: [0, 0, 1000, 1000], 'you.deck': [100, 500, 100, 140], 'you.discard': [300, 500, 100, 140], 'you.captain': [500, 500, 100, 140], 'you.hand': [0, 800, 600, 140] });
    s.zones['you.deck']!.fan = 'stack'; s.zones['you.discard']!.kind = 'pile'; s.zones['you.captain']!.cards = 1; s.zones['you.hand']!.cards = 4;
    expect(commonPrefix(['you.deck', 'you.x.y'])).toBe('you');
    const c = consolidate(s, ['you.captain', 'you.deck', 'you.discard', 'you.hand'], 'column');
    expect(c.id).toBe('you.piles');
    const z = c.screen.zones;
    expect(Object.keys(z)).toEqual(['you', 'you.hand', 'you.piles', 'you.piles.deck', 'you.piles.discard', 'you.piles.captain']);
    expect(z['you.piles']!.r).toEqual([100, 500, 50 + 12, 3 * 70 + 4 * 6]);
    expect(z['you.piles.discard']).toEqual({ r: [106, 582, 50, 70], kind: 'pile' });
    expect(consolidate(s, ['you.deck'], 'row', 'you').id).toBe('');
    const sp = split(c.screen, 'you.piles');
    expect(sp.ids).toEqual(['you.deck', 'you.discard', 'you.captain']);
    expect(sp.screen.zones['you.deck']).toEqual({ r: [100, 500, 100, 140], fan: 'stack' });
    expect(sp.screen.zones['you.discard']).toEqual({ r: [100, 653, 100, 140], kind: 'pile', full: true });
    expect(sp.screen.zones['you.captain']!.cards).toBe(1);
    expect(split(s, 'you.deck').ids).toEqual([]);
  });
  it('K280 consolidate in a row with a custom pile size; split refuses a parent that is not consolidated; a nested selection is not duplicated', () => {
    const s = { ...scr({ a: [0, 0, 100, 140], 'b.c': [200, 0, 100, 140] }), pile: [20, 30] as [number, number] };
    s.zones.a!.cards = 1; s.zones['b.c']!.cards = 1;
    const c = consolidate(s, ['a', 'b.c'], 'row');
    expect(c.id).toBe('piles');
    expect(c.screen.zones.piles!.r).toEqual([0, 0, 2 * 20 + 3 * 3, 30 + 6]);
    const t = { ...c.screen, zones: { ...c.screen.zones, piles: { ...c.screen.zones.piles!, from: undefined } } };
    expect(split(t, 'piles')).toEqual({ screen: t, ids: [] });
    expect(split(scr({ you: [0, 0, 500, 500], 'you.d': [0, 0, 50, 70] }), 'you').ids).toEqual([]);
    const n = { ...s, zones: { ...s.zones, 'a.x': { r: [0, 0, 100, 140] as [number, number, number, number], cards: 1 } } };
    expect(Object.keys(consolidate(n, ['a', 'a.x'], 'row').screen.zones)).toEqual(['b.c', 'piles', 'piles.a', 'piles.a.x']);
  });
  it('K280 copy zones from another screen, mode/variant names, zoom maths', () => {
    const a = scr({ crew: [10, 10, 100, 100], 'crew.x': [20, 20, 5, 5] }), b = scr({ crew: [0, 0, 1, 1] });
    const c = copyZones(a, b, 'crew');
    expect(c.id).toBe('crew-2');
    expect(c.screen.zones['crew-2.x']!.r).toEqual([20, 20, 5, 5]);
    expect(screenModes(['solo/table', '2p/rulebook', 'solo/x', 'phone'])).toEqual([['solo', ['solo/table', 'solo/x']], ['2p', ['2p/rulebook']], ['phone', ['phone']]]);
    const v = stageView(1000, 500, 524, 524, 500, 500, 1);
    expect(v).toEqual({ sc: 0.5, left: 12, top: 125, padW: 524, padH: 500 });
    const z = stageView(1000, 500, 524, 524, 500, 500, 3);
    expect([z.sc, z.left, z.padW]).toEqual([1.5, 12, 1524]);
    expect(keepPoint(100, 1.5, 12, 50)).toBe(112);
    expect([clampZoom(0), clampZoom(99)]).toEqual([0.1, 20]);
  });
  it('editor.html carries the current index.ts (run node components/layout-editor/build.mjs)', () => {
    const html = readFileSync(HTML, 'utf8');
    expect(inline(html) === html).toBe(true);
  });
});
