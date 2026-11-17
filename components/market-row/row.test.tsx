import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarketRow } from './ui.ts'

const face = (id: string) => <b data-face={id}>{id}</b>

describe('MarketRow', () => {
  it('draws slots, an empty slot, deck counts and labels; marks and taps from the pick', () => {
    const tap = vi.fn()
    const { container } = render(
      <MarketRow name="a" label="Market" row={{ slots: ['c1', null, 'c3'], decks: { A: 4 } }} face={face} speed={0}
        labels={(i) => <i data-price={i} />} empty={() => <em>Empty</em>}
        pick={{ marks: { 'buy:a:0': 'legal', 'buy:a:2': 'barred' }, tap }} />,
    )
    expect(container.querySelector('[data-part="deck"]')!.getAttribute('data-count')).toBe('4')
    expect(container.querySelector('[data-slot="1"]')!.getAttribute('data-empty')).toBe('true')
    expect(container.querySelectorAll('[data-price]')).toHaveLength(2)
    const cards = container.querySelectorAll('[data-part="card"]')
    expect(cards[0]!.getAttribute('data-mark')).toBe('legal')
    expect(cards[1]!.getAttribute('data-mark')).toBe('barred')
    fireEvent.click(cards[1]!)
    expect(tap).not.toHaveBeenCalled()
    fireEvent.click(cards[0]!)
    expect(tap).toHaveBeenCalledWith('buy:a:0')
  })
  it('deals a new card from the deck element when the view changes', () => {
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 10, height: 14 } as DOMRect)
    const { rerender } = render(<MarketRow name="a" label="Market" row={{ slots: ['c1', null], decks: { A: 2 } }} face={face} />)
    rerender(<MarketRow name="a" label="Market" row={{ slots: ['c2', 'c1'], decks: { A: 1 } }} face={face} />)
    expect(animate).toHaveBeenCalledTimes(2)
    expect(animate.mock.calls[1]![1]).toMatchObject({ delay: 520, duration: 520 })
  })
  it('deals a card from the deck its filled event names (a fallback deck)', () => {
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { left: this.getAttribute('data-deck') === 'M' ? 500 : 0, top: 0, width: 10, height: 14 } as DOMRect
    })
    const { rerender } = render(<MarketRow name="d" label="Market" row={{ slots: [null], decks: { S: 0, M: 2 } }} face={face} />)
    rerender(<MarketRow name="d" label="Market" row={{ slots: ['m1'], decks: { S: 0, M: 1 } }} face={face}
      events={[{ kind: 'filled', row: 'd', slot: 0, card: 'm1', from: 'M' }]} />)
    expect(animate).toHaveBeenCalledTimes(1)
    expect(String((animate.mock.calls[0]![0] as Keyframe[])[0]!.transform)).toContain('translate(500px')
  })
})

describe('MarketRow top offer (K251)', () => {
  it('draws the top on the deck, pickable', () => {
    const tap = vi.fn()
    const { container } = render(<MarketRow name="a" label="Market" row={{ slots: ['c1', 'c2'], top: 'c3', decks: { A: 2 } }} face={face} speed={0} pick={{ marks: { 'buy:a:top': 'legal' }, tap }} />)
    const t = container.querySelector('[data-offer="top"]')!
    expect(t.getAttribute('data-card')).toBe('c3')
    expect(container.querySelector('[data-part="deck"]')!.contains(t)).toBe(true)
    fireEvent.click(t)
    expect(tap).toHaveBeenCalledWith('buy:a:top')
  })
})
