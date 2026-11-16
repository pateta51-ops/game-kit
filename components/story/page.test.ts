import { describe, expect, it } from 'vitest';
import { holds, pageProblems, pageView, type Page } from './page';

const T = { a: 'Hello {who}, {n} left.', b: 'Base', c: 'Else', h: 'Head' };
const P: Page = { id: 'p', entries: [
  { t: 'header', key: 'h', level: 2 },
  { t: 'text', key: 'a', vars: { who: 'Cap', n: 3 } },
  { t: 'mod', mods: ['boxed'], entry: { t: 'branch', cases: [{ when: { all: ['x', { not: 'y' }] }, entry: { t: 'text', key: 'b' } }, { entry: { t: 'text', key: 'c' } }] } },
] };
const applied = (n: ReturnType<typeof pageView>[number] | undefined) => {
  if (n?.t !== 'mod' || n.node.t !== 'branch') throw new Error('shape');
  return n.node.cases.map((c) => c.applied);
};

describe('story page', () => {
  it('fills variables, marks the applied branch, keeps the others', () => {
    const v = pageView(P, T, ['x']);
    expect(v[1]).toMatchObject({ text: 'Hello Cap, 3 left.' });
    expect(applied(v[2])).toEqual([true, false]);
    expect(applied(pageView(P, T, ['x', 'y'])[2])).toEqual([false, true]);
  });
  it('overlay replaces text and marks it changed', () => {
    const v = pageView(P, T, [], { a: 'New {who}' });
    expect(v[1]).toMatchObject({ text: 'New Cap', changed: true });
    expect(v[0]).toMatchObject({ changed: false });
  });
  it('holds and problems', () => {
    expect(holds({ any: ['q', 'x'] }, ['x'])).toBe(true);
    expect(pageProblems(P, { a: '' })).toContain('p: missing text "h"');
  });
});
