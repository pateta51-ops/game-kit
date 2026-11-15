import { describe, expect, it } from 'vitest';
import { defineMachine } from '../state-machines/machine';
import { follow, parseHash, routeHref } from './index';

const NAMES = ['home', 'play', 'over', 'proof'] as const;
type N = (typeof NAMES)[number];

describe('hash routes', () => {
  it('parses name, parts and query; unknown is home', () => {
    expect(parseHash('', NAMES, 'home').name).toBe('home');
    expect(parseHash('#/', NAMES, 'home').name).toBe('home');
    expect(parseHash('#/nope', NAMES, 'home').name).toBe('home');
    const r = parseHash('#/proof/a%20b/%E0%A4%A?x=1', NAMES, 'home');
    expect(r.name).toBe('proof');
    expect(r.parts).toEqual(['a b', '%E0%A4%A']);
    expect(parseHash('#/play?x=1&y', NAMES, 'home').query.get('x')).toBe('1');
  });

  it('writes hashes', () => {
    expect(routeHref<N>('home', 'home')).toBe('#/');
    expect(routeHref<N>('proof', 'home', ['a b'])).toBe('#/proof/a%20b');
    expect(routeHref<N>('play', 'home', [], 'x=1')).toBe('#/play?x=1');
  });

  it('follow moves along the machine and throws on an edge it lacks', () => {
    const m = defineMachine<N, 'ended' | 'again'>({
      id: 'test.app-frame.routes',
      initial: 'home',
      states: { home: { on: {} }, play: { on: { ended: 'over' } }, over: { on: { again: 'play' } }, proof: { on: {} } },
      describe: { purpose: 'test', source: 'components/app-frame/routes.test.ts' },
    });
    const went: string[] = [];
    expect(follow(m, 'play', 'ended', 'home', 'q=1', (h) => went.push(h))).toBe('#/over?q=1');
    expect(went).toEqual(['#/over?q=1']);
    expect(() => follow(m, 'home', 'ended', 'home', '', () => undefined)).toThrow();
  });
});
