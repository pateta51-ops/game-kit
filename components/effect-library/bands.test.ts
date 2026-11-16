import { describe, expect, it } from 'vitest';
import { bannerAt, createBandSlots, createRingStore, flight, phaseSweeps } from './bands';

const order = ['mulligan', 'play', 'combat', 'end'];
const el = () => {
  const s = new Map<string, string>();
  return { style: { setProperty: (k: string, v: string) => void s.set(k, v) }, s } as unknown as HTMLElement & { s: Map<string, string> };
};

describe('K150 phase band', () => {
  it('sweep is skipped on undo, with moving cards and under Quick', () => {
    expect(phaseSweeps(order, 'play', 'combat')).toBe(true);
    expect(phaseSweeps(order, undefined, 'play')).toBe(true);
    expect(phaseSweeps(order, 'combat', 'play')).toBe(false);
    expect(phaseSweeps(order, 'play', 'combat', { cardsMove: true })).toBe(false);
    expect(phaseSweeps(order, 'play', 'combat', { quick: true })).toBe(false);
    expect(phaseSweeps(order, 'play', 'unknown')).toBe(true);
  });
  it('a level-up band takes its own slot', () => {
    const s = createBandSlots<string>();
    s.put('phase', 'Combat');
    expect(s.put('level', 'Level 2')).toBeUndefined();
    expect(s.get('phase')).toBe('Combat');
    s.clear('level');
    expect(s.all()).toEqual([['phase', 'Combat']]);
  });
});

describe('K150 banner lines', () => {
  const lines = [{ text: 'a', cards: ['c1'] }, { text: 'b', cards: ['c2', 'c3'] }, { text: 'c' }];
  it('one line every 650 ms; the newest rings its cards; hold grows per line', () => {
    expect(bannerAt(lines, 0).shown.length).toBe(1);
    expect(bannerAt(lines, 0).ring).toEqual(['c1']);
    expect(bannerAt(lines, 650).ring).toEqual(['c2', 'c3']);
    expect(bannerAt(lines, 5000).shown.length).toBe(3);
    expect(bannerAt(lines, 5000).ring).toEqual([]);
    expect(bannerAt(lines, 0).doneAt).toBe(4500 + 650 * 3);
    expect(bannerAt(lines, 6449).done).toBe(false);
    expect(bannerAt(lines, 6450).done).toBe(true);
  });
  it('until tapped never finishes; reduced shows all and rings none', () => {
    expect(bannerAt(lines, 1e9, { tapped: true })).toMatchObject({ done: false, doneAt: null });
    expect(bannerAt(lines, 0, { reduced: true })).toMatchObject({ ring: [], shown: lines });
  });
  it('ring store notifies on change only', () => {
    const r = createRingStore();
    const seen: string[][] = [];
    const off = r.subscribe((x) => seen.push([...x]));
    r.set(['a']);
    r.set(['a']);
    r.set([]);
    off();
    r.set(['z']);
    expect(seen).toEqual([['a'], []]);
    expect(r.get()).toEqual(['z']);
  });
});

describe('K150 card flight', () => {
  it('the name moves from the overlay to the board card inside the callback only', async () => {
    const from = el();
    const to = el();
    const log: string[] = [];
    const doc = {
      startViewTransition: (cb: () => void) => {
        log.push(`before:${from.s.get('view-transition-name') ?? ''}/${to.s.get('view-transition-name') ?? ''}`);
        cb();
        log.push(`after:${from.s.get('view-transition-name') ?? ''}/${to.s.get('view-transition-name') ?? ''}`);
        return { finished: Promise.resolve() };
      },
    } as unknown as Document;
    await flight(doc, { name: 'card-1', from, to, className: 'fl', swap: () => void log.push('swap') });
    expect(log).toEqual(['before:card-1/', 'swap', 'after:none/card-1']);
    expect(to.s.get('view-transition-name')).toBe('none');
    expect(from.s.get('view-transition-class')).toBe('');
  });
  it('without the API it just swaps', async () => {
    let n = 0;
    await flight({} as Document, { name: 'x', from: el(), to: el(), swap: () => void (n += 1) });
    expect(n).toBe(1);
  });
});
