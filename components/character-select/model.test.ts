import { describe, expect, it } from 'vitest';
import {
  choiceOf,
  deckPage,
  deckTabs,
  fieldsFor,
  firstAllowed,
  groupBySet,
  pieces,
  portraitCrop,
  sortRoster,
  splitName,
} from './model.ts';
import { fields, kindOrder, modes, roster, sets } from './demo/game.ts';

describe('character-select model', () => {
  it('sorts the roster by set order, then stat, unknown sets last, input unchanged', () => {
    const list = [
      { id: 'a', set: 'hills', stat: 1 },
      { id: 'b', set: 'core', stat: 5 },
      { id: 'c', set: 'other', stat: 0 },
      { id: 'd', set: 'core', stat: 2 },
      { id: 'e', set: 'core', stat: 2 },
    ];
    expect(sortRoster(list, sets).map((x) => x.id)).toEqual(['d', 'e', 'b', 'a', 'c']);
    expect(list[0]?.id).toBe('a');
  });

  it('groups by set in roster order', () => {
    const g = groupBySet(roster, sets);
    expect(g.map((x) => x.set.label)).toEqual(['Core box', 'Into the Hills']);
    expect(g[0]?.items.map((c) => c.id)).toEqual(['ada', 'bram', 'cora', 'dov']);
  });

  it('splits a name on the short name, else on the last word', () => {
    expect(splitName('Ada Quill', 'Quill')).toEqual({ first: 'Ada', last: 'Quill' });
    expect(splitName('Mother of Owls', 'Owls')).toEqual({ first: 'Mother of', last: 'Owls' });
    expect(splitName('Sir Bram Holt')).toEqual({ first: 'Sir Bram', last: 'Holt' });
    expect(splitName('Gale')).toEqual({ first: '', last: 'Gale' });
  });

  it('pieces: icons, chips and links, each phrase once, unknown icons kept as text', () => {
    const out = pieces('Rope and <FRIEND> pay 2 [coin] [star]; Rope again', ['coin'], [{ phrase: 'Rope', id: 'r1' }]);
    expect(out).toEqual([
      { kind: 'link', text: 'Rope', id: 'r1' },
      { kind: 'text', text: ' and ' },
      { kind: 'chip', name: 'FRIEND' },
      { kind: 'text', text: ' pay 2 ' },
      { kind: 'icon', name: 'coin' },
      { kind: 'text', text: ' ' },
      { kind: 'text', text: '[star]' },
      { kind: 'text', text: '; Rope again' },
    ]);
  });

  it('pieces: the longer phrase wins an overlap and a word inside another word is not linked', () => {
    const out = pieces('The Old Map and Maps', [], [
      { phrase: 'Map', id: 'm' },
      { phrase: 'Old Map', id: 'om' },
    ]);
    expect(out.filter((p) => p.kind === 'link')).toEqual([{ kind: 'link', text: 'Old Map', id: 'om' }]);
  });

  it('deck tabs follow the kind order with counts, unknown kinds after', () => {
    const deck = [
      { id: '1', name: 'a', kind: 'PLACE' },
      { id: '2', name: 'b', kind: 'TOOL' },
      { id: '3', name: 'c', kind: 'ZZZ' },
      { id: '4', name: 'd', kind: 'TOOL' },
    ];
    expect(deckTabs(deck, kindOrder)).toEqual([
      { kind: 'ALL', count: 4 },
      { kind: 'TOOL', count: 2 },
      { kind: 'PLACE', count: 1 },
      { kind: 'ZZZ', count: 1 },
    ]);
  });

  it('filters by kind and search, pages and clamps the page', () => {
    const deck = roster[0]?.deck ?? [];
    const all = deckPage(deck, 'ALL', '', 0, 5);
    expect(all).toMatchObject({ list: 14, pages: 3, page: 0 });
    expect(all.cards).toHaveLength(5);
    const last = deckPage(deck, 'ALL', '', 99, 5);
    expect(last).toMatchObject({ page: 2 });
    expect(last.cards).toHaveLength(4);
    const tools = deckPage(deck, 'TOOL', '', 0, 5);
    expect(tools.cards.every((c) => c.kind === 'TOOL')).toBe(true);
    expect(tools.list).toBeGreaterThan(0);
    expect(deckPage(deck, 'ALL', ' old MAP ', 0, 5).cards.map((c) => c.name)).toEqual(['Old Map 3', 'Old Map 13']);
    expect(deckPage(deck, 'ALL', 'zzzz', 0, 5)).toMatchObject({ list: 0, pages: 1, page: 0 });
  });

  it('crops a region around the focus, never below the bottom edge', () => {
    const c = portraitCrop({ x: 0.5, y: 0.3 }, { width: 0.5, ratio: 1170 / 1635, bottom: 0.6 }, 33 / 52);
    const [, py] = c.position.split(' ').map((v) => parseFloat(v));
    const w = 100 / parseFloat(c.size);
    const h = (w * 1170) / 1635 / (33 / 52);
    const y0 = ((py ?? 0) / 100) * (1 - h);
    expect(y0 + h).toBeLessThanOrEqual(0.6 + 1e-4);
    expect(c.size).toBe('200.00% auto');
    expect(c.position.startsWith('50.00%')).toBe(true);
  });

  it('a crop wider than the image shrinks to fit the height', () => {
    const c = portraitCrop({ x: 0.5, y: 0.5 }, { width: 1, ratio: 1, bottom: 0.5 }, 1);
    expect(c.size).toBe('200.00% auto');
  });

  it('fields by mode; a choice without opponent in a mode that has none, options of hidden fields dropped', () => {
    expect(fieldsFor(fields, 'practice').map((f) => f.id)).toEqual(['pack', 'extra', 'seed']);
    const practice = modes[1];
    if (practice === undefined) throw new Error('no mode');
    expect(choiceOf(practice, 'ada', 'bram', { difficulty: 'easy', pack: 'core' }, fields)).toEqual({
      mode: 'practice',
      pick: 'ada',
      opponent: null,
      options: { pack: 'core' },
    });
  });

  it('keeps the current opponent when allowed, else the first allowed', () => {
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(firstAllowed(list, 'c', () => true)).toBe('c');
    expect(firstAllowed(list, 'a', (id) => id !== 'a')).toBe('b');
    expect(firstAllowed(list, null, () => false)).toBeNull();
  });
});
