import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pile } from './ui.ts'

const face = (id: string) => <b data-face={id}>{id}</b>
const back = () => <i data-back="1" />
const cards = ['a', 'b', 'c']

afterEach(() => vi.restoreAllMocks())

describe('Pile', () => {
  it('rests as a stack: top face, edges, count; a hidden card is a back and its id never reaches the DOM', () => {
    const { container } = render(<Pile label="Deck" view={{ count: 3, cards: [null, null, null] }} face={face} back={back} />)
    expect(container.querySelector('[data-part="pile"]')!.getAttribute('data-count')).toBe('3')
    expect(container.querySelectorAll('[data-part="stack-card"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-face]')).toHaveLength(0)
    expect(screen.getByRole('group').getAttribute('aria-label')).toBe('Deck, 3 cards')
  })
  it('an empty pile shows an empty slot and no button', () => {
    const { container } = render(<Pile label="Deck" view={{ count: 0 }} face={face} back={back} />)
    expect(container.querySelector('[data-part="stack"]')!.getAttribute('data-empty')).toBe('true')
    expect(container.querySelector('[data-part="stack-hit"]')).toBeNull()
  })
  it('opens the fan on a click (no motion at speed 0) and Escape closes it', () => {
    render(<Pile label="Discard" view={{ count: 3, cards }} face={face} back={back} speed={0} unit={() => 10} />)
    fireEvent.click(screen.getByRole('button', { name: /Look through/ }))
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
    expect(document.querySelectorAll('[data-part="fan-card"]')).toHaveLength(3)
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(document.querySelector('[data-part="fan"]')).toBeNull()
  })
  it('a pick from the pile marks the named cards and a click taps; the fan closes when the prompt no longer names them', () => {
    const tap = vi.fn()
    const props = { label: 'Discard', view: { count: 3, cards }, face, back, speed: 0, unit: () => 10 }
    const { rerender } = render(<Pile {...props} pick={{ marks: { b: 'legal', c: 'barred' }, tap }} />)
    fireEvent.click(screen.getByRole('button', { name: /Look through/ }))
    const hits = document.querySelectorAll<HTMLElement>('[data-part="fan-hit"]')
    expect(hits[1]!.dataset.mark).toBe('legal')
    expect(hits[0]!.dataset.dim).toBe('true')
    fireEvent.click(hits[1]!)
    fireEvent.click(hits[2]!)
    expect(tap.mock.calls).toEqual([['b']])
    rerender(<Pile {...props} pick={{ marks: {}, tap }} />)
    expect(document.querySelector('[data-part="fan"]')).toBeNull()
  })
  it('on a phone the cards open in the sheet as a grid, "Top" on the first; a non-pick tap asks for detail', () => {
    const onDetail = vi.fn()
    render(<Pile label="Discard" view={{ count: 3, cards }} face={face} back={back} phone onDetail={onDetail} />)
    fireEvent.click(screen.getByRole('button', { name: /Look through/ }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(document.querySelectorAll('[data-part="grid-card"]')).toHaveLength(3)
    expect(document.querySelectorAll('[data-part="grid-top"]')).toHaveLength(1)
    fireEvent.click(document.querySelectorAll('[data-part="grid-card"]')[2]!)
    expect(onDetail).toHaveBeenCalledWith('c')
  })
})

const mockAnimate = (state: 'running' | 'finished') => {
  const fn = vi.fn(() => ({ playState: state, finished: state === 'finished' ? Promise.resolve() : new Promise(() => undefined), cancel: () => undefined }))
  Object.defineProperty(HTMLElement.prototype, 'animate', { value: fn, configurable: true, writable: true })
  return fn
}
afterEach(() => {
  delete (HTMLElement.prototype as { animate?: unknown }).animate
  vi.unstubAllGlobals()
})
const base = { label: 'Discard', face, back, unit: () => 10 }
const open = () => fireEvent.click(screen.getByRole('button', { name: /Look through|Choose/ }))
const wait = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })

describe('Pile review fixes', () => {
  it('no hidden id in the open fan (null cards are backs, only the public id is in the DOM)', () => {
    render(<Pile {...base} view={{ count: 3, cards: [null, 'x-public', null] }} speed={0} />)
    open()
    expect(document.querySelectorAll('[data-part="fan-card"]')).toHaveLength(3)
    expect(document.querySelectorAll('[data-card]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-back]').length).toBeGreaterThan(0)
  })
  it('the phone grid shows backs for null cards and no id for them', () => {
    render(<Pile {...base} view={{ count: 2, cards: [null, 'p'] }} phone />)
    open()
    expect(document.querySelectorAll('[data-part="grid-card"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-part="grid-card"][data-card]')).toHaveLength(1)
  })
  it('a click on a fanned card does not answer while the cards still fly out', () => {
    const anim = mockAnimate('running')
    const tap = vi.fn()
    render(<Pile {...base} view={{ count: 3, cards }} pick={{ marks: { b: 'legal' }, tap }} speed={1} />)
    open()
    expect(anim).toHaveBeenCalled()
    fireEvent.click(document.querySelectorAll<HTMLElement>('[data-part="fan-hit"]')[1]!)
    expect(tap).not.toHaveBeenCalled()
  })
  it('after landing a click answers', async () => {
    mockAnimate('finished')
    const tap = vi.fn()
    render(<Pile {...base} view={{ count: 3, cards }} pick={{ marks: { b: 'legal' }, tap }} speed={1} />)
    open()
    await wait()
    fireEvent.click(document.querySelectorAll<HTMLElement>('[data-part="fan-hit"]')[1]!)
    expect(tap).toHaveBeenCalledWith('b')
  })
  it('fly-out runs one animation per card plus the backdrop; gather runs again and the fan goes', async () => {
    const anim = mockAnimate('finished')
    render(<Pile {...base} view={{ count: 3, cards }} speed={1} />)
    open()
    expect(anim).toHaveBeenCalledTimes(4)
    anim.mockClear()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(anim).toHaveBeenCalledTimes(4)
    await wait()
    expect(document.querySelector('[data-part="fan"]')).toBeNull()
  })
  it('no animation at speed 0', () => {
    const anim = mockAnimate('finished')
    render(<Pile {...base} view={{ count: 3, cards }} speed={0} />)
    open()
    expect(anim).not.toHaveBeenCalled()
  })
  it('no animation with prefers-reduced-motion', () => {
    const anim = mockAnimate('finished')
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<Pile {...base} view={{ count: 3, cards }} speed={1} />)
    open()
    expect(anim).not.toHaveBeenCalled()
  })
  it('Tab stays inside the fan and focus returns to the pile button when it closes', () => {
    render(<Pile {...base} view={{ count: 3, cards }} pick={{ marks: { a: 'legal', b: 'legal' }, tap: () => undefined }} speed={0} />)
    open()
    const fan = document.querySelector('[data-part="fan"]')!
    expect(fan.contains(document.activeElement)).toBe(true)
    for (const shiftKey of [false, false, true]) {
      fireEvent.keyDown(document, { key: 'Tab', shiftKey })
      expect(fan.contains(document.activeElement)).toBe(true)
    }
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('[data-part="fan"]')).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('[data-part="stack-hit"]'))
  })
  it('the game passes the pick words for the stack button while the prompt picks from the pile', () => {
    render(<Pile {...base} view={{ count: 3, cards }} pick={{ marks: { b: 'legal' }, tap: () => undefined }} words={{ pick: (l, n) => `Choose from the ${l}: ${String(n)}` }} speed={0} />)
    expect(screen.getByRole('button', { name: 'Choose from the Discard: 1' })).toBeTruthy()
  })
})
