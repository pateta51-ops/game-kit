import { describe, expect, it } from 'vitest';
import { Delivery, screenMain, screenProblems, type ScreenInput } from './index.ts';
import { plainWords } from '../plain-text/index.ts';

// A fake game: two faces, one icon, two clauses that open prompts.
const faces = [{ id: 'scout', text: 'Draw 2 cards. ¶ Pay {coin} to gain 3 {coin}.' }, { id: 'guard', text: 'Gain 3 coins.' }];
const clauses = [{ id: 'scout#1', text: 'Draw 2 cards.' }, { id: 'scout#2', text: 'Pay {coin} to gain 3 {coin}.' }];
const good: ScreenInput = {
  faces, clauses, zoom: (t) => t.replace(/ ¶ /g, ' '), icons: { coin: 'Coin' },
  prompts: [{ clause: 'scout#1', shown: 'Draw 2 cards: yes or no?' }, { clause: 'scout#2', shown: 'Pay {coin} to gain 3?' }], opened: ['scout#1', 'scout#2'],
};
describe('cards:screen (K489)', () => {
  it('passes a game whose screen matches', () => {
    expect(screenProblems(good)).toEqual([]);
    const out: string[] = [];
    expect(screenMain(good, (l) => out.push(l))).toBe(0);
    expect(out).toEqual(['cards:screen ok']);
  });
  it('zoom differs at word N, 1-based after plain-text normalisation', () => {
    const z = (t: string) => t.replace('Draw 2 cards.', 'Draw 3 cards.');
    expect(screenProblems({ ...good, zoom: z })).toEqual(['zoom scout: differs at word 2']);
    expect(screenProblems({ ...good, zoom: (t) => `${t} extra` })).toEqual(['zoom scout: differs at word 10', 'zoom guard: differs at word 4']);
    expect(screenProblems({ ...good, zoom: (t) => t.replace('Gain', 'Gain ').replace(/\s*¶\s*/, '  ') })).toEqual([]);
  });
  it('an icon with a blank or missing label fails', () => {
    expect(screenProblems({ ...good, icons: { coin: '  ', gem: undefined } })).toEqual(['icon coin has no label', 'icon gem has no label']);
    expect(screenProblems({ ...good, icons: {} })).toEqual(['icon coin has no label']);
  });
  it('a prompt without its clause amount fails', () => {
    const r = screenProblems({ ...good, prompts: [good.prompts[0]!, { clause: 'scout#2', shown: 'Pay to gain?' }] });
    expect(r).toEqual(['prompt for scout#2: no amount']);
  });
  it('an opened prompt no test scanned fails', () => {
    expect(screenProblems({ ...good, opened: ['scout#1', 'guard#1', 'scout#2'] })).toEqual(['guard#1 opens a prompt no test scanned']);
    expect(screenMain({ ...good, opened: ['x#1'] }, () => undefined)).toBe(1);
  });
  it('plainWords normalises quotes, dashes, marks and spaces', () => {
    expect(plainWords('It’s a—b ¶ c d')).toEqual(["It's", 'a-b', 'c', 'd']);
  });
  it('Delivery records opened clauses and scanned screens', () => {
    let open: string | null = 'a#1';
    const d = new Delivery<null, string>({
      load: () => undefined, dispatch: () => ({ ok: true, autos: [] }), prompt: () => open,
      clauseOf: (p) => (p === 'quiet' ? null : 'a#1'), screen: (p) => (p === 'a#1' ? 'Pay 2?' : null),
    });
    d.load(null);
    open = 'quiet'; d.answer('x');
    expect([...d.opened]).toEqual(['a#1']);
    expect(d.screens).toEqual([{ clause: 'a#1', shown: 'Pay 2?' }]);
    expect(screenProblems({ ...good, clauses: [{ id: 'a#1', text: 'Pay 2.' }], faces: [], icons: {}, prompts: d.screens, opened: d.opened })).toEqual([]);
  });
  it('screenMain exits 1 for a zoom, an icon and an amount failure', () => {
    const run = (i: ScreenInput) => { const out: string[] = []; return [screenMain(i, (l) => out.push(l)), out] as const; };
    expect(run({ ...good, zoom: (t) => t.replace('Draw 2', 'Draw 3') })).toEqual([1, ['zoom scout: differs at word 2']]);
    expect(run({ ...good, icons: { coin: '' } })).toEqual([1, ['icon coin has no label']]);
    expect(run({ ...good, prompts: [{ clause: 'scout#1', shown: 'Draw?' }, good.prompts[1]!] })).toEqual([1, ['prompt for scout#1: no amount']]);
  });
  it('a Delivery without clauseOf or screen records nothing', () => {
    const d = new Delivery<null, string>({ load: () => undefined, dispatch: () => ({ ok: true, autos: [] }), prompt: () => 'a#1' });
    d.load(null); d.answer('x');
    expect([...d.opened]).toEqual([]);
    expect(d.screens).toEqual([]);
  });
});
