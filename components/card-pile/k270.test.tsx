import { readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Pile } from './ui.ts'

const face = (id: string) => <b>{id}</b>
const back = () => <i />
const base = { label: 'Discard', face, back, view: { count: 3, cards: ['a', 'b', 'c'] }, speed: 0, unit: () => 10 }
const btn = () => screen.getByRole('button', { name: /Look through/ })
const shown = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => c[0] !== null)

describe('K270 previewOn', () => {
  it('default hover: focus on top, fan and grid cards never previews; the pointer does', () => {
    const pv = vi.fn()
    const { unmount } = render(<Pile {...base} onPreview={pv} />)
    fireEvent.focus(btn())
    fireEvent.click(btn())
    for (const h of document.querySelectorAll('[data-part="fan-hit"]')) fireEvent.focus(h)
    expect(shown(pv)).toEqual([])
    unmount()
    render(<Pile {...base} phone onPreview={pv} />)
    fireEvent.click(btn())
    for (const g of document.querySelectorAll('[data-part="grid-card"]')) fireEvent.focus(g)
    expect(shown(pv)).toEqual([])
    fireEvent.pointerEnter(btn())
    expect(shown(pv)).toHaveLength(1)
  })
  it('hover-focus: focus previews top, fan and grid cards', () => {
    const pv = vi.fn()
    const { unmount } = render(<Pile {...base} previewOn="hover-focus" onPreview={pv} />)
    fireEvent.focus(btn())
    fireEvent.click(btn())
    fireEvent.focus(document.querySelector('[data-part="fan-hit"]')!)
    expect(pv.mock.calls.map((c: unknown[]) => c[1])).toEqual(['top', 'fan'])
    unmount()
    pv.mockClear()
    render(<Pile {...base} phone previewOn="hover-focus" onPreview={pv} />)
    fireEvent.click(btn())
    fireEvent.focus(document.querySelector('[data-part="grid-card"]')!)
    expect(pv.mock.calls.map((c: unknown[]) => c[1])).toEqual(['grid'])
  })
  it('hover-focus: the focus return after the fan closes does not preview', () => {
    const pv = vi.fn()
    render(<Pile {...base} previewOn="hover-focus" onPreview={pv} />)
    fireEvent.click(btn())
    pv.mockClear()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(document.activeElement).toBe(btn())
    expect(shown(pv)).toEqual([])
  })
  it('hover-focus: the Sheet focus return on close does not preview either', () => {
    const pv = vi.fn()
    render(<Pile {...base} phone previewOn="hover-focus" onPreview={pv} />)
    btn().focus()
    fireEvent.click(btn())
    pv.mockClear()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(document.activeElement).toBe(btn())
    expect(shown(pv)).toEqual([])
  })
})

describe('K270 fan CSS scope', () => {
  it('pile fan is fixed and hand fan is absolute on one page', () => {
    const dir = import.meta.dirname
    const st = document.createElement('style')
    st.textContent = readFileSync(`${dir}/card-pile.css`, 'utf8') + readFileSync(`${dir}/../card-hand/card-hand.css`, 'utf8')
    document.head.append(st)
    document.body.innerHTML = '<div data-part="hand"><ul data-part="fan" id="h"></ul></div><div data-part="fan" data-pile-fan="x" id="p"></div>'
    expect(getComputedStyle(document.getElementById('p')!).position).toBe('fixed')
    expect(getComputedStyle(document.getElementById('h')!).position).toBe('absolute')
  })
})
