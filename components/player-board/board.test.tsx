import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlayerBoard } from './ui.ts'

const layout = { w: 640, h: 320, zones: { a: { r: [0, 0, 320, 320] }, b: { r: [320, 0, 320, 320] } } }

describe('PlayerBoard', () => {
  it('draws zones as anchors with slots, in rem; a hidden id never reaches the DOM', () => {
    const { container } = render(
      <PlayerBoard layout={layout} views={{ a: { count: 2, cards: ['x', null] } }} card={{ w: 100, h: 140 }} mat="m.png" rem={0.1}
        slot={({ id }) => (id ? <b data-face={id} /> : <i data-back="1" />)} />)
    expect(container.querySelector('[data-part="mat"]')!.getAttribute('src')).toBe('m.png')
    const a = container.querySelector('[data-zone="a"]') as HTMLElement
    expect(a.getAttribute('data-place')).toBe('a')
    expect(a.style.width).toBe('32rem')
    expect(a.querySelectorAll('[data-part="slot"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-face]')).toHaveLength(1)
    expect(container.querySelector('[data-zone="b"]')!.getAttribute('data-count')).toBe('0')
  })
})
