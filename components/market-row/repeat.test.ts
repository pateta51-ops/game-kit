// K653: older engines' market cases restated on made-up rows: a repeated purchase, and a row that grows extra slots.
import { describe, expect, it } from 'vitest';
import { cardsIn, newZones, type Zoned } from '../card-zones/index.ts';
import { clearMarket, fillEmpty, marketOptions, marketZones, refill, slotsOf, takeSlot, type MarketCfg } from './index.ts';

describe('K653 market-row: a repeated purchase sees the refill of the one before', () => {
  it('I B23: row [a, b], deck top c, "buy 2 cards": after buying a, the second prompt offers b and c (the game chooses `when: now`)', () => {
    const rows = { r: { slots: 2, decks: ['D'] } };
    const cfg: MarketCfg = { rows, when: 'now' };
    const s: Zoned = { zones: newZones({ ...marketZones(rows), D: { seen: 'count', cards: ['a', 'b', 'c'] }, hand: { seen: 'all' } }) };
    refill(s, cfg);
    const first = marketOptions(s, cfg, () => undefined);
    expect(first.map((o) => o.card)).toEqual(['a', 'b']);
    takeSlot(s, cfg, 'r', 0, 'hand');
    expect(marketOptions(s, cfg, () => undefined).map((o) => o.card).sort()).toEqual(['b', 'c']);
  });
});

describe('K653 market-row: arrivals with extra slots', () => {
  // The row is declared with room for extras; the game keeps how many slots are open and gives no deck past them.
  type G = Zoned & { open: number };
  const rows = { u: { slots: 6, decks: ['D'] } };
  const cfg: MarketCfg<G> = { rows, when: 'later', source: (s, _row, i) => (i < s.open ? ['D'] : []) };
  const filled = (r: { events: readonly { kind: string }[] }) => r.events.map((e) => (e.kind === 'filled' && 'slot' in e && 'card' in e ? `${String(e.slot)}=${String(e.card)}` : e.kind));
  it('W B20: the kit fills only the open slots, from the left: 4 open fill 4; a fifth opened slot (an extra, at the right end) gets the next card; an opened slot on an empty deck stays empty; after a clear, 4 open slots fill 4 again (the game supplies the open count through `source`)', () => {
    const s: G = { open: 4, zones: newZones({ ...marketZones(rows), D: { seen: 'count', cards: ['d1', 'd2', 'd3', 'd4', 'd5'] } }) };
    refill(s, cfg);
    expect(slotsOf(s, cfg, 'u')).toEqual(['d1', 'd2', 'd3', 'd4', null, null]);
    s.open = 5;
    expect(filled(fillEmpty(s, cfg))).toEqual(['4=d5']);
    s.open = 6;
    expect(filled(fillEmpty(s, cfg))).toEqual([]);
    expect(slotsOf(s, cfg, 'u')).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', null]);
    clearMarket(s, cfg);
    expect(cardsIn(s, 'D')).toEqual(['d1', 'd2', 'd3', 'd4', 'd5']);
    s.open = 4;
    refill(s, cfg);
    expect(slotsOf(s, cfg, 'u')).toEqual(['d1', 'd2', 'd3', 'd4', null, null]);
  });
  it('W B20: an empty slot left of the extras is refilled before the extra slot', () => {
    const s: G = { open: 4, zones: newZones({ ...marketZones(rows), D: { seen: 'count', cards: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] }, out: { seen: 'all' } }) };
    refill(s, cfg);
    takeSlot(s, cfg, 'u', 1, 'out');
    s.open = 5;
    expect(filled(fillEmpty(s, cfg))).toEqual(['1=d5', '4=d6']);
  });
});
