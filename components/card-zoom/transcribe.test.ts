import { describe, expect, it } from 'vitest'
import { buildIndex } from '../glossary/match.ts'
import { ruleIdFilter } from '../plain-text/index.ts'
import { plainSegs, transcribe, zoomLine, type Seg } from './index.ts'

const icons = { gold: { label: 'gold', body: '<circle r="5"/>' }, dmg: { label: 'damage', body: '<path d="M0 0"/>' }, act: { label: 'action' } }
const glossary = buildIndex([
  { id: 'exhaust', term: 'Exhaust', summary: 'Turn it sideways; pay [[gold]].' },
  { id: 'gold', term: 'Gold', icon: 'gold', summary: 'Money.' },
  { id: 'damage', term: 'Damage', icon: 'dmg', summary: 'Hits on a card.' },
])
const ids = ruleIdFilter({ long: ['TURN'], short: ['AR'] })
const card = {
  title: 'Scout',
  meta: ['Ally · 12'],
  printed: [{ text: 'Exhaust: pay [[gold]], deal [[dmg]][[dmg]]. Then [[gold]] again.' }, { label: 'Side B', text: 'Gain [[act]] and a widget.' }],
  notes: [{ label: 'Errata', text: 'Deal [[dmg]] once (AR-12).' }, { text: '(TURN-07)' }],
  tokens: [{ label: 'Damage', count: 2, icon: 'dmg' }, { label: 'Shield' }],
}
const tr = transcribe(card, { icons, glossary, strip: ids.strip })
const terms = (segs: Seg[]) => segs.flatMap((s) => (s.t === 'term' ? [s.id] : []))

describe('transcribe (K203)', () => {
  it('decodes printed text with its icons and glossary terms', () => {
    expect(tr.printed.map((b) => plainSegs(b.text))).toEqual(['Exhaust: pay gold, deal damagedamage. Then gold again.', 'Gain action and a widget.'])
    expect(tr.printed[1]?.label).toBe('Side B')
    expect(terms(tr.printed[0]?.text ?? [])).toEqual(['exhaust'])
    expect(tr.printed[0]?.text.find((s) => s.t === 'icon')).toEqual({ t: 'icon', name: 'gold', label: 'gold', known: true, id: 'gold' })
  })
  it('lists each icon of the card once, in order, tokens and unknown icons included', () => {
    expect(tr.legend.map((s) => [s.name, s.id])).toEqual([['gold', 'gold'], ['dmg', 'damage'], ['act', null]])
    const odd = transcribe({ title: 'X', printed: [{ text: '[[odd]] [[gold]] [[odd]]' }] }, { icons })
    expect(odd.legend.map((s) => [s.name, s.known])).toEqual([['odd', false], ['gold', true]])
  })
  it('lists the tokens with their icon and count', () => {
    expect(tr.tokens.map((t) => [plainSegs(t.label), t.count, t.icon?.name])).toEqual([['Damage', 2, 'dmg'], ['Shield', undefined, undefined]])
  })
  it('links only terms the glossary has, and each link resolves', () => {
    const all = [...tr.printed, ...tr.notes].flatMap((b) => terms(b.text))
    expect(all.every((id) => glossary.entries.has(id))).toBe(true)
    expect(tr.terms.map((t) => t.id)).toEqual(['exhaust', 'damage'])
    expect(plainSegs(tr.terms[0]?.summary ?? [])).toBe('Turn it sideways; pay gold.')
    expect(JSON.stringify(tr)).not.toMatch(/"id":"widget"|"id":"shield"/)
  })
  it('links whole words only (an ending the glossary allows aside)', () => {
    const o = { icons, glossary }
    expect(terms(zoomLine('Exhaustion and Exhausts.', o))).toEqual(['exhaust'])
    expect(plainSegs(zoomLine('Exhaustion and Exhausts.', o))).toBe('Exhaustion and Exhausts.')
    expect(terms(zoomLine('Goldsmith', o))).toEqual([])
  })
  it('a term beside an icon of the same name: both link, each listed once', () => {
    const t = transcribe({ title: 'X', printed: [{ text: 'Gold[[gold]] and gold.' }] }, { icons, glossary })
    expect(t.printed[0]?.text.map((s) => [s.t, s.t === 'text' ? null : s.id])).toEqual([['term', 'gold'], ['icon', 'gold'], ['text', null], ['term', 'gold'], ['text', null]])
    expect([t.legend.length, t.terms.map((x) => x.id)]).toEqual([1, ['gold']])
  })
  it('reads the game syntax', () => {
    const t = transcribe({ title: 'X', printed: [{ text: 'Pay [gold], keep \\[gold].' }] }, { icons, glossary, syntax: { open: '[', close: ']', escape: '\\' } })
    expect(plainSegs(t.printed[0]?.text ?? [])).toBe('Pay gold, keep [gold].')
    expect(t.legend.map((s) => s.name)).toEqual(['gold'])
  })
  it('strips rule ids from every text; drops only what holds nothing else', () => {
    expect(tr.notes.map((b) => [b.label, plainSegs(b.text)])).toEqual([['Errata', 'Deal damage once.']])
    const s = transcribe(
      {
        title: 'Scout (TURN-07)',
        meta: ['Ally (AR-12)', '(TURN-08)'],
        printed: [{ label: 'Side B (AR-13)', text: 'Gain [[gold]].' }, { label: 'Ruled', text: '(AR-14)' }],
        tokens: [{ label: '(AR-15)', count: 2, icon: 'gold' }, { label: 'Damage (TURN-09)' }],
      },
      { icons: { gold: { label: 'gold (AR-16)' } }, glossary: buildIndex([{ id: 'damage', term: 'Damage (TURN-10)', aliases: ['Damage'], summary: 'Hits (AR-17).' }]), strip: ids.strip },
    )
    expect(s.title).toBe('Scout')
    expect(s.meta.map(plainSegs)).toEqual(['Ally'])
    expect(s.printed.map((b) => [b.label, plainSegs(b.text)])).toEqual([['Side B', 'Gain gold.'], ['Ruled', '']])
    expect(s.tokens.map((t) => [plainSegs(t.label), t.count, t.icon?.label])).toEqual([['', 2, 'gold'], ['Damage', undefined, undefined]])
    expect(s.terms.map((t) => [t.term, plainSegs(t.summary)])).toEqual([['Damage', 'Hits.']])
    expect(s.legend.map((x) => x.label)).toEqual(['gold'])
    expect(JSON.stringify([s, tr])).not.toMatch(new RegExp(ids.pattern))
  })
  it('works without a glossary: nothing linked', () => {
    const bare = transcribe(card, { icons })
    expect(bare.terms).toEqual([])
    expect(bare.legend.every((s) => s.id === null)).toBe(true)
  })
})
