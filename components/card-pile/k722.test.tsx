import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Pile } from './ui.ts'

const css = readFileSync(new URL('./card-pile.css', import.meta.url), 'utf8')
const rule = (part: string) => new RegExp(`\\[data-part='${part}'\\]\\) \\{([^}]*)\\}`).exec(css)![1]!
const z = (part: string) => Number(/z-index:\s*(\d+)/.exec(rule(part))![1])
const face = (id: string) => <b>{id}</b>
const back = () => <i />

describe('K722 children and the pick badge draw over the top card and the stack-hit', () => {
  it('stack-over has a z-index above stack-hit and the top card, positioned, and no pointer events', () => {
    expect(z('stack-over')).toBeGreaterThan(z('stack-hit'))
    expect(z('stack-over')).toBeGreaterThan(20)
    expect(rule('stack-over')).toMatch(/position:\s*absolute/)
    expect(rule('stack-over')).toMatch(/pointer-events:\s*none/)
  })
  it('children and the badge sit inside stack-over, after the hit button; a click on the hit still opens the pile', () => {
    const { container } = render(<Pile label="Deck" view={{ count: 3, cards: ['a', 'b', 'c'] }} face={face} back={back} speed={0} unit={() => 10} pick={{ marks: { a: 'legal' }, tap: () => undefined }} badge={() => 'B'}><em data-testid="kid">3</em></Pile>)
    const over = container.querySelector('[data-part="stack-over"]')!
    expect(over.querySelector('[data-part="pick-badge"]')).not.toBeNull()
    expect(over.contains(screen.getByTestId('kid'))).toBe(true)
    const hit = container.querySelector('[data-part="stack-hit"]')!
    expect(hit.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(hit)
    expect(hit.getAttribute('aria-expanded')).toBe('true')
  })
  it('no wrapper without children or badge', () => {
    const { container } = render(<Pile label="Deck" view={{ count: 3, cards: ['a', 'b', 'c'] }} face={face} back={back} />)
    expect(container.querySelector('[data-part="stack-over"]')).toBeNull()
  })
})
