import { describe, expect, it } from 'vitest'
import { newZones, viewOf, zoneProblems, type Zoned } from '../card-zones/index.ts'
import { cardsIn } from '../card-zones/index.ts'
import { cycleOffer, takeOffer, offersOf, clearMarket, cycleSlot, fillEmpty, fillSlot, marketOptions, marketView, marketZones, parseOption, refill, rowMotions, slideRight, slotsOf, takeSlot, flyFrames, type MarketCfg } from './index.ts'

// A small fake game: row `a` (3 slots) from deck A; row `d` (2 slots) from its small deck S with a fallback to M.
const ROWS = { a: { slots: 3, decks: ['A'], prices: [3, 2, 1], cycle: [2, 1, 0] }, d: { slots: 2, decks: ['S', 'M'], prices: [5, 4] } }
const game = (A: string[], S: string[], M: string[]): Zoned & { gold: number } => ({
  gold: 3,
  zones: newZones({ ...marketZones(ROWS), A: { seen: 'count', cards: A }, S: { seen: 'count', cards: S }, M: { seen: 'count', cards: M }, hand: { seen: 'all' } }),
})
type G = ReturnType<typeof game>
const later: MarketCfg<G> = { rows: ROWS, when: 'later' }
const now: MarketCfg<G> = { rows: ROWS, when: 'now' }

describe('market-row engine', () => {
  it('refill fills every slot from the left, a slot falls back to the next deck, both empty leaves it empty', () => {
    const s = game(['a1', 'a2'], ['s1'], [])
    const r = refill(s, later)
    expect(slotsOf(s, later, 'a')).toEqual(['a1', 'a2', null])
    expect(slotsOf(s, later, 'd')).toEqual(['s1', null])
    expect(r.events.map((e) => e.kind === 'filled' && `${e.card}<${e.from}`)).toEqual(['a1<A', 'a2<A', 's1<S'])
    const t = game([], [], ['m1', 'm2'])
    refill(t, later)
    expect(slotsOf(t, later, 'd')).toEqual(['m1', 'm2'])
    expect(zoneProblems(s, 3)).toEqual([])
  })
  it('prices from the table plus the game hook; options disabled with the reason from afford', () => {
    const s = game(['a1', 'a2', 'a3'], ['s1', 's2'], [])
    refill(s, later)
    const cfg: MarketCfg<G> = { ...later, price: (_s, row, _i, _c, base) => (row === 'd' ? base - 1 : base) }
    const o = marketOptions(s, cfg, (_v, cost) => (cost > s.gold ? `needs ${String(cost)} Gold` : undefined))
    expect(o.map((x) => `${x.id}=${String(x.cost)}${x.enabled ? '' : '!'}`)).toEqual(['buy:a:0=3', 'cycle:a:0=2', 'buy:a:1=2', 'cycle:a:1=1', 'buy:a:2=1', 'cycle:a:2=0', 'buy:d:0=4!', 'buy:d:1=3'])
    expect(o.find((x) => x.id === 'buy:d:0')!.why).toBe('needs 4 Gold')
    expect(parseOption('cycle:a:2')).toEqual({ verb: 'cycle', row: 'a', slot: 2 })
  })
  it('later: a take leaves the slot empty; the refill slides right (order kept), then fills from the left', () => {
    const s = game(['a1', 'a2', 'a3', 'a4'], [], ['m1', 'm2'])
    refill(s, later)
    expect(takeSlot(s, later, 'a', 2, 'hand').events).toEqual([{ kind: 'taken', row: 'a', slot: 2, card: 'a3', to: 'hand' }])
    expect(slotsOf(s, later, 'a')).toEqual(['a1', 'a2', null])
    const r = refill(s, later)
    expect(slotsOf(s, later, 'a')).toEqual(['a4', 'a1', 'a2'])
    expect(r.events.filter((e) => e.kind === 'slid').map((e) => e.kind === 'slid' && `${e.card}:${String(e.from)}>${String(e.to)}`)).toEqual(['a2:1>2', 'a1:0>1'])
  })
  it('now: a take refills that slot at once with no slide', () => {
    const s = game(['a1', 'a2', 'a3', 'a4'], [], [])
    refill(s, now)
    takeSlot(s, now, 'a', 1, 'hand')
    expect(slotsOf(s, now, 'a')).toEqual(['a1', 'a4', 'a3'])
    takeSlot(s, now, 'a', 0, 'hand')
    expect(slotsOf(s, now, 'a')).toEqual([null, 'a4', 'a3'])
  })
  it('cycle puts the card at the bottom of its home pile', () => {
    const s = game(['a1', 'a2', 'a3', 'a4'], [], [])
    refill(s, later)
    cycleSlot(s, later, 'a', 0)
    expect(s.zones.A!.cards).toEqual(['a4', 'a1'])
    const t = game(['a1', 'a2', 'a3', 'a4'], [], [])
    refill(t, now)
    cycleSlot(t, now, 'a', 0)
    expect(slotsOf(t, now, 'a')).toEqual(['a4', 'a2', 'a3'])
    expect(t.zones.A!.cards).toEqual(['a1'])
  })
  it('a slot whose deck the player picks stops the fill; the answer fills it and the fill goes on without a second slide', () => {
    const s = game([], ['s1'], ['m1', 'm2'])
    const cfg: MarketCfg<G> = { ...later, ask: (_s, row) => row === 'd' }
    const r = refill(s, cfg)
    expect(r.pending).toEqual({ row: 'd', slot: 0, decks: [{ zone: 'S', empty: false }, { zone: 'M', empty: false }] })
    expect(() => fillSlot(s, cfg, 'd', 0, 'A')).toThrow(/not a source/)
    fillSlot(s, cfg, 'd', 0, 'M')
    const r2 = fillEmpty(s, cfg)
    expect(r2.pending).toEqual({ row: 'd', slot: 1, decks: [{ zone: 'S', empty: false }, { zone: 'M', empty: false }] })
    fillSlot(s, cfg, 'd', 1, 'S')
    expect(slotsOf(s, cfg, 'd')).toEqual(['m1', 's1'])
    expect(fillEmpty(s, cfg).pending).toBeUndefined()
  })
  it('clear sends every card to the bottom of its home pile, rows in order, slots left to right', () => {
    const s = game(['a1', 'a2', 'a3'], ['s1', 's2'], ['m0'])
    refill(s, later)
    const cfg: MarketCfg<G> = { ...later, home: (_s, row) => (row === 'a' ? 'A' : 'M') }
    expect(clearMarket(s, cfg).map((e) => e.card)).toEqual(['a1', 'a2', 'a3', 's1', 's2'])
    expect(s.zones.A!.cards).toEqual(['a1', 'a2', 'a3'])
    expect(s.zones.M!.cards).toEqual(['m0', 's1', 's2'])
    expect(slotsOf(s, cfg, 'a')).toEqual([null, null, null])
  })
  it('the view shows the face-up slots and deck counts only', () => {
    const s = game(['a1', 'a2', 'a3', 'a4'], [], ['m1', 'm2', 'm3'])
    refill(s, later)
    const v = marketView(viewOf(s, 'p1'), ROWS)
    expect(v).toEqual({ a: { slots: ['a1', 'a2', 'a3'], decks: { A: 1 } }, d: { slots: ['m1', 'm2'], decks: { S: 0, M: 1 } } })
    expect(JSON.stringify(v)).not.toContain('a4')
    expect(JSON.stringify(v)).not.toContain('m3')
  })
  it('slideRight alone keeps order and reports nothing for a packed row', () => {
    const s = game(['a1', 'a2', 'a3'], [], [])
    refill(s, later)
    expect(slideRight(s, later, 'a')).toEqual([])
  })
})

describe('market-row motion', () => {
  it('survivors slide first, then new cards are dealt left to right with a stagger; none at speed 0', () => {
    const m = rowMotions(['a1', 'a2', null], ['a4', 'a1', 'a2'])
    expect(m).toEqual([
      { kind: 'slide', card: 'a1', from: 0, to: 1, delay: 0, ms: 520 },
      { kind: 'slide', card: 'a2', from: 1, to: 2, delay: 0, ms: 520 },
      { kind: 'deal', card: 'a4', to: 0, delay: 520, ms: 520 },
    ])
    expect(rowMotions([null, null], ['x', 'y'], 0.5).map((x) => x.delay)).toEqual([0, 45])
    expect(rowMotions([null], ['x'], 0)).toEqual([])
    expect(flyFrames({ x: 0, y: 0, w: 50, h: 70 }, { x: 100, y: 10, w: 100, h: 140 })[0]!.transform).toBe('translate(-100px, -10px) scale(0.5, 0.5)')
  })
})

describe('market-row top offer (K251)', () => {
  const R = { r: { slots: 2, decks: ['D'], topOffer: true } }
  const mk = (n: number): Zoned => ({ zones: newZones({ ...marketZones(R), D: { seen: 'top', cards: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].slice(0, n) }, hand: { seen: 'all' } }) })
  const cfg: MarketCfg = { rows: R, when: 'later' }
  const top = (s: Zoned) => cardsIn(s, 'D')[0]
  it('refill gives 2 slots and a top; the view shows the top and no other deck id', () => {
    const s = mk(6)
    refill(s, cfg)
    expect(offersOf(s, cfg, 'r')).toEqual([0, 1, 'top'])
    const v = marketView(viewOf(s, 'p1'), R).r!
    expect(v).toMatchObject({ slots: ['c1', 'c2'], top: 'c3', decks: { D: 4 } })
    expect(offersOf(v, cfg, 'r')).toEqual([0, 1, 'top'])
    const text = JSON.stringify(viewOf(s, 'p1'))
    for (const c of ['c4', 'c5', 'c6']) expect(text).not.toContain(c)
  })
  it('take the top, cycle a slot, refill to 2 and a new top', () => {
    const s = mk(6)
    refill(s, cfg)
    const t = takeOffer(s, cfg, 'r', 'top', 'hand')
    expect(t.events[0]).toMatchObject({ kind: 'taken', card: 'c3', slot: -1, offer: 'top' })
    expect(cardsIn(s, 'hand')).toEqual(['c3'])
    expect(top(s)).toBe('c4')
    cycleOffer(s, cfg, 'r', 0)
    expect(cardsIn(s, 'D').at(-1)).toBe('c1')
    expect(slotsOf(s, cfg, 'r')).toEqual([null, 'c2'])
    fillEmpty(s, cfg)
    expect(slotsOf(s, cfg, 'r')).toEqual(['c4', 'c2'])
    expect(top(s)).toBe('c5')
    expect(zoneProblems(s, 6)).toEqual([])
  })
  it('take a slot, cycle the top', () => {
    const s = mk(6)
    refill(s, cfg)
    takeOffer(s, cfg, 'r', 1, 'hand')
    expect(cardsIn(s, 'hand')).toEqual(['c2'])
    const e = cycleOffer(s, cfg, 'r', 'top').events[0]
    expect(e).toMatchObject({ kind: 'returned', card: 'c3', offer: 'top', to: 'D' })
    expect(cardsIn(s, 'D')).toEqual(['c4', 'c5', 'c6', 'c3'])
    fillEmpty(s, cfg)
    expect(slotsOf(s, cfg, 'r')).toEqual(['c1', 'c4'])
    expect(top(s)).toBe('c5')
  })
  it('deck down to 2, 1, 0 cards; an empty offer throws', () => {
    for (const [n, offers] of [[4, [0, 1, 'top']], [3, [0, 1, 'top']], [2, [0, 1]], [1, [0]], [0, []]] as const) {
      const s = mk(n)
      refill(s, cfg)
      expect(offersOf(s, cfg, 'r')).toEqual(offers)
    }
    const s = mk(2)
    refill(s, cfg)
    expect(marketView(viewOf(s, 'p1'), R).r!.top).toBeNull()
    expect(() => takeOffer(s, cfg, 'r', 'top', 'hand')).toThrow()
    expect(() => cycleOffer(s, cfg, 'r', 'top')).toThrow()
    expect(() => takeOffer(s, cfg, 'r', 1, 'hand')).not.toThrow()
    expect(() => takeOffer(s, cfg, 'r', 1, 'hand')).toThrow()
  })
  it('a card cycled onto an empty deck becomes the top offer', () => {
    const s = mk(2)
    refill(s, cfg)
    expect(cardsIn(s, 'D')).toEqual([])
    cycleOffer(s, cfg, 'r', 0)
    expect(top(s)).toBe('c1')
    expect(offersOf(s, cfg, 'r')).toEqual([1, 'top'])
    expect(marketView(viewOf(s, 'p1'), R).r!.top).toBe('c1')
    const t = mk(1)
    refill(t, cfg)
    cycleOffer(t, cfg, 'r', 0)
    expect(offersOf(t, cfg, 'r')).toEqual(['top'])
  })
})
