import { describe, expect, it } from 'vitest';
import { parseIconText, plainOf, unknownIcons } from '../card-parts/text.ts';
import { dossierRow, loadText } from './index.ts';

const icons = { gem: { label: 'gem' }, star: { label: 'star' } };
const curly = { open: '{', close: '}', separator: ':' };

describe('K521 icon value', () => {
  it('{gem:2} gives name gem, value 2', () => {
    expect(parseIconText('Pay {gem:2} or {star:x}.', icons, curly)).toEqual([
      { t: 'text', s: 'Pay ' }, { t: 'icon', name: 'gem', label: 'gem', known: true, value: 2 }, { t: 'text', s: ' or ' },
      { t: 'icon', name: 'star', label: 'star', known: true, value: 'x' }, { t: 'text', s: '.' },
    ]);
    expect(parseIconText('[[gem:3]]', icons, { open: '[[', close: ']]', separator: ':' })[0]).toMatchObject({ name: 'gem', value: 3 });
    expect(plainOf(parseIconText('{gem:2}', icons, curly))).toBe('gem 2');
    expect(unknownIcons(['{rock:1}', '{gem:1}'], icons, curly)).toEqual(['rock']);
  });
  it('without the separator today\'s parts', () => {
    expect(parseIconText('{gem:2}', icons, { open: '{', close: '}' })).toEqual([{ t: 'icon', name: 'gem:2', label: 'gem:2', known: false }]);
    expect(parseIconText('[[gem]]', icons)).toEqual([{ t: 'icon', name: 'gem', label: 'gem', known: true }]);
  });
});

const d = dossierRow({ icons, syntax: curly, textColumns: ['rules', 'flavor'], columns: { cid: 'component_id', copies: 'quantity', kind: 'type' }, notDeck: ['rules sheet'] });
const csv = (rows: string[]) => `cid,deck,name,kind,copies,rules,flavor,icons_on_card,cost\n${rows.join('\n')}\n`;
const run = (rows: string[]) => loadText({ kinds: { card: d.kind } }, { card: { csv: csv(rows) } });

describe('K521 dossierRow', () => {
  it('maps columns, joins text, keeps extras, expands copies end to end', () => {
    const r = run(['x,main,X,unit,3,Gain {gem:2}.,Quiet.,1,5', 'r,main,Rules,rules sheet,1,,,,']);
    if (!r.ok) throw new Error(r.problems.join());
    const recs = r.pack.records.card as never[];
    expect(recs[0]).toMatchObject({ id: 'x', type: 'unit', quantity: 3, text: 'Gain {gem:2}. ¶ Quiet.', extra: { cost: '5' } });
    expect(d.expand(recs).map((c) => c.id)).toEqual(['x#1', 'x#2', 'x#3']);
  });
  it('icons_on_card: wrong fails with the id, empty is silent', () => {
    const bad = run(['x,main,X,unit,1,{gem:1} {star:1},,3,']);
    expect(!bad.ok && bad.problems.join()).toContain('component "x": icons_on_card is 3 but the text prints 2');
    expect(run(['x,main,X,unit,1,{gem:1} {star:1},,,']).ok).toBe(true);
    expect(run(['x,main,X,unit,1,{gem:1} {star:1},,2,']).ok).toBe(true);
  });
  it('reports an unknown icon', () => {
    const bad = run(['y,main,Y,unit,1,{rock:1},,,']);
    expect(!bad.ok && bad.problems.join()).toContain('unknown icon "rock"');
  });
  it('checkIconsOnCard: false switches the count check off', () => {
    const off = dossierRow({ icons, syntax: curly, textColumns: ['rules'], checkIconsOnCard: false });
    const r = loadText({ kinds: { card: off.kind } }, { card: { csv: 'component_id,rules,icons_on_card\nx,{gem:1},5\n' } });
    expect(r.ok).toBe(true);
  });
  it('a quantity that is not a number is a problem with the id', () => {
    const bad = run(['q,main,Q,unit,two,,,,']);
    expect(!bad.ok && bad.problems.join()).toContain('component "q": quantity "two" is not a whole number');
  });
});
