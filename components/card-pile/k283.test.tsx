import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Pile } from './ui.ts'

const base = { label: 'Discard', face: (id: string) => <b>{id}</b>, back: () => <i />, view: { count: 3, cards: ['a', 'b', 'c'] }, speed: 0, unit: () => 10 }
const hit = () => document.querySelector('[data-part="stack-hit"]')!

describe('K283 hitTitle', () => {
  it('the stack button keeps its native title by default; hitTitle false drops it', () => {
    const { unmount } = render(<Pile {...base} />)
    expect(hit().getAttribute('title')).toBeTruthy()
    unmount()
    render(<Pile {...base} hitTitle={false} />)
    expect(hit().hasAttribute('title')).toBe(false)
    expect(hit().getAttribute('aria-label')).toBeTruthy()
  })
})
