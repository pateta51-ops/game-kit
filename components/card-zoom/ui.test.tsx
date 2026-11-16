import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildIndex } from '../glossary/match'
import { CardZoom, transcribe, useZoomEscape } from './ui'

const icons = { gold: { label: 'gold', body: '<circle r="5"/>' } }
const glossary = buildIndex([{ id: 'exhaust', term: 'Exhaust', summary: 'Turn it sideways.' }, { id: 'gold', term: 'Gold', icon: 'gold', summary: 'Money.' }])
const tr = transcribe({ title: 'Scout', printed: [{ text: 'Exhaust: gain [[gold]] and [[odd]].' }], tokens: [{ label: 'Gold', count: 3, icon: 'gold' }] }, { icons, glossary })

function Esc({ onClose, open }: { onClose: () => void; open?: boolean }) {
  useZoomEscape(onClose, open)
  return null
}

describe('CardZoom (K203)', () => {
  it('draws the sections with content, icons inline, terms and explained icons as links', () => {
    const onTerm = vi.fn()
    const { container } = render(<CardZoom tr={tr} icons={icons} onTerm={onTerm} face={<i data-face="" />} />)
    expect([...container.querySelectorAll('[data-zoom-section]')].map((e) => e.getAttribute('data-zoom-section'))).toEqual(['head', 'printed', 'tokens', 'legend', 'terms'])
    expect(container.querySelector('[data-face]')).toBeTruthy()
    const printed = container.querySelector('[data-zoom-section="printed"]') as HTMLElement
    expect(printed.querySelector('svg.kz-icon[data-icon="gold"]')).toBeTruthy()
    expect(printed.querySelector('.kz-unknown')?.textContent).toBe('odd')
    expect([...printed.querySelectorAll('[data-glossary]')].map((e) => e.getAttribute('data-glossary'))).toEqual(['exhaust', 'gold'])
    fireEvent.click(printed.querySelector('[data-glossary="exhaust"]') as Element)
    expect(onTerm).toHaveBeenCalledWith('exhaust', expect.anything())
    expect(container.querySelectorAll('[data-zoom-section="legend"] .kz-legend-item')).toHaveLength(2)
  })
  it('a slot replaces a section, null leaves it out', () => {
    const { container } = render(<CardZoom tr={tr} icons={icons} slots={{ legend: null, terms: (t) => <b>{t.terms.length}</b> }} />)
    expect(container.querySelector('[data-zoom-section="legend"]')).toBeNull()
    expect(container.querySelector('[data-zoom-section="terms"]')?.textContent).toBe('2')
  })
  it('draws notes, follows order and words, and the game draws icons with renderIcon', () => {
    const t = transcribe({ title: 'X', printed: [{ text: 'Pay [[gold]].' }], notes: [{ label: 'Errata', text: 'Pay [[gold]] twice.' }] }, { icons, glossary })
    const { container } = render(<CardZoom tr={t} icons={icons} order={['notes', 'printed']} words={{ notes: 'Ruling' }} renderIcon={(s) => <u data-mine={s.name}>{s.label}</u>} />)
    expect([...container.querySelectorAll('[data-zoom-section]')].map((e) => e.getAttribute('data-zoom-section'))).toEqual(['notes', 'printed'])
    const notes = container.querySelector('[data-zoom-section="notes"]') as HTMLElement
    expect(notes.querySelector('.kz-heading')?.textContent).toBe('Ruling')
    expect(notes.querySelector('.kz-label')?.textContent).toBe('Errata')
    expect(notes.textContent).toContain('Pay gold twice.')
    expect(container.querySelectorAll('u[data-mine="gold"]')).toHaveLength(2)
    expect(container.querySelector('svg')).toBeNull()
  })
  it('the legend shows an unknown icon by its name, unlinked', () => {
    const legend = render(<CardZoom tr={tr} icons={icons} />).container.querySelectorAll('[data-zoom-section="legend"] .kz-legend-item')
    const odd = legend[1] as HTMLElement
    expect(odd.querySelector('.kz-unknown')?.textContent).toBe('odd')
    expect(odd.querySelector('[data-glossary]')).toBeNull()
  })
  it('Escape closes through the optional helper', () => {
    const onClose = vi.fn()
    render(<Esc onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledOnce()
  })
  it('Escape does nothing when closed or already handled', () => {
    const onClose = vi.fn()
    render(<Esc onClose={onClose} open={false} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    const other = vi.fn()
    render(<Esc onClose={other} />)
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    e.preventDefault()
    window.dispatchEvent(e)
    expect([onClose.mock.calls.length, other.mock.calls.length]).toEqual([0, 0])
  })
})
