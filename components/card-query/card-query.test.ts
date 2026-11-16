import { describe, expect, it } from 'vitest';
import { compileQuery, filterCards, type Field, type QueryError } from './index.ts';

interface C { name: string; cost: number | null; hp: number; sp: number; traits: string[]; unique: boolean; back?: { name: string } }
const fields: Field<C>[] = [
  { name: 'name', aliases: ['n'], type: 'string', get: (c, s) => (s === 'back' ? c.back?.name : c.name) },
  { name: 'cost', type: 'number', get: c => c.cost },
  { name: 'hp', type: 'number', get: c => c.hp },
  { name: 'sp', type: 'number', get: c => c.sp },
  { name: 'trait', type: 'list', get: c => c.traits },
  { name: 'unique', type: 'boolean', get: c => c.unique },
];
const cards: C[] = [
  { name: 'Café Owner', cost: 2, hp: 5, sp: 4, traits: ['Ally', 'Urban'], unique: true, back: { name: 'Closed' } },
  { name: 'Knife', cost: 1, hp: 0, sp: 0, traits: ['Weapon'], unique: false },
  { name: 'Ghost', cost: null, hp: 3, sp: 9, traits: [], unique: false },
];
const q = (s: string) => filterCards(cards, s, fields).map(c => c.name);

describe('card query', () => {
  it('fuzzy = and exact ==', () => {
    expect(q('name = "cafe"')).toEqual(['Café Owner']);
    expect(q('name == "knife"')).toEqual(['Knife']);
    expect(q('name == "kni"')).toEqual([]);
    expect(q('n != "knife" & cost = null')).toEqual(['Ghost']);
  });
  it('numbers, arithmetic, field refs', () => {
    expect(q('hp + sp < 10')).toEqual(['Café Owner', 'Knife']);
    expect(q('hp > sp')).toEqual(['Café Owner']);
    expect(q('cost * 2 >= 2')).toEqual(['Café Owner', 'Knife']);
  });
  it('lists, regex, boolean, not, parens, back', () => {
    expect(q('trait ? "ally"')).toEqual(['Café Owner']);
    expect(q('trait ? /^w/i')).toEqual(['Knife']);
    expect(q('name = /^g/i')).toEqual(['Ghost']);
    expect(q('unique')).toEqual(['Café Owner']);
    expect(q('!unique & (cost == 1 | cost == null)')).toEqual(['Knife', 'Ghost']);
    expect(q('back:name = "closed"')).toEqual(['Café Owner']);
  });
  it('precedence, division, unary minus, g flag, != null, types', () => {
    expect(q('cost == 1 | cost == 2 & unique')).toEqual(['Café Owner', 'Knife']);
    expect(q('cost == 2 & unique | cost == 1')).toEqual(['Café Owner', 'Knife']);
    expect(q('hp / 2 >= 2')).toEqual(['Café Owner']);
    expect(q('-hp < -4')).toEqual(['Café Owner']);
    expect(q('name = /e/g')).toEqual(['Café Owner', 'Knife']);
    expect(q('name = /[a-z]/g')).toEqual(['Café Owner', 'Knife', 'Ghost']);
    expect(q('cost != 2')).toEqual(['Knife']);
    expect(q('cost != null')).toEqual(['Café Owner', 'Knife']);
    expect(() => compileQuery('name + 1 > 2', fields)).toThrow(/number expected/);
    expect(() => compileQuery('name > 2', fields)).toThrow(/number expected/);
    expect(() => compileQuery('hp ? "a"', fields)).toThrow(/list expected/);
  });
  it('errors carry line and column', () => {
    const e = (s: string) => { try { compileQuery(s, fields); } catch (x) { return x as QueryError; } throw new Error('no error'); };
    expect([e('hp <').line, e('hp <').col]).toEqual([1, 5]);
    expect([e('hp > 1 &\n  bogus').line, e('hp > 1 &\n  bogus').col]).toEqual([2, 3]);
    expect(e('name = "x').message).toMatch(/unterminated/);
    expect(e('(hp > 1').message).toMatch(/"\)"/);
    expect(e('hp > 1 )').col).toBe(8);
  });
});
