import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArtImage, ArtProvider, CardFace, IconText, TokenLayer, useArt, type CardLayout } from './ui'

const L: CardLayout = { w: 200, h: 100, zones: { art: { x: 0, y: 0, w: 100, h: 100 }, text: { x: 100, y: 0, w: 100, h: 50, kind: 'text' }, unused: { x: 0, y: 0, w: 1, h: 1 } }, anchors: { dmg: { x: 50, y: 50, dx: 20 } } }
const icons = { gold: { label: 'gold', body: '<circle r="5"/>' }, act: { label: 'action', src: '/a.svg' } }

function Name() {
  return <b>{useArt<{ title: string }>().title}</b>
}

describe('CardFace', () => {
  it('draws the zones the game fills, with its own component in a slot, and tokens at anchors', () => {
    const { container } = render(
      <ArtProvider art={{ title: 'Scout' }}>
        <CardFace layout={L} data-card="c1" zones={{ art: <ArtImage url="/scout.png" alt="" />, text: (z) => <Name key={z.w} /> }}>
          <TokenLayer layout={L} tokens={[{ anchor: 'dmg' }, { anchor: 'dmg' }]} render={(_, i) => <i>{i}</i>} />
        </CardFace>
      </ArtProvider>,
    )
    const face = container.querySelector('.kc-face') as HTMLElement
    expect(face.dataset.card).toBe('c1')
    expect(face.style.aspectRatio).toBe('200 / 100')
    expect([...face.querySelectorAll('[data-zone]')].map((e) => e.getAttribute('data-zone'))).toEqual(['art', 'text'])
    const text = face.querySelector('[data-zone="text"]') as HTMLElement
    expect([text.style.left, text.style.width, text.dataset.kind]).toEqual(['50%', '50%', 'text'])
    expect(screen.getByText('Scout')).toBeTruthy()
    expect(face.querySelector('img.kc-art')?.getAttribute('src')).toBe('/scout.png')
    expect([...face.querySelectorAll<HTMLElement>('.kc-token')].map((e) => e.style.left)).toEqual(['25%', '35%'])
  })
  it('shows the stand-in while a picture decodes', () => {
    render(<ArtProvider art={null} urls={['/slow.png']}><ArtImage url="/slow.png" fallback={<span>stand-in</span>} /></ArtProvider>)
    expect(screen.getByText('stand-in')).toBeTruthy()
  })
  it('a second provider closing keeps the first one\'s pictures; the same urls in a new array do not restart', async () => {
    const reads: string[] = []
    const fromCache = (u: string) => {
      reads.push(u)
      return Promise.resolve(new Blob(['x']))
    }
    const Table = ({ zoom, urls }: { zoom: boolean; urls: string[] }) => (
      <ArtProvider art={null} urls={urls} fromCache={fromCache}>
        <ArtImage url="/t.png" fallback={<span>wait</span>} />
        {zoom ? <ArtProvider art={null} urls={['/z.png']} fromCache={fromCache}><ArtImage url="/z.png" /></ArtProvider> : null}
      </ArtProvider>
    )
    const { container, rerender } = render(<Table zoom={false} urls={['/t.png']} />)
    await waitFor(() => { expect(container.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/) })
    rerender(<Table zoom={false} urls={['/t.png']} />)
    rerender(<Table zoom urls={['/t.png']} />)
    await waitFor(() => { expect(container.querySelectorAll('img')).toHaveLength(2) })
    rerender(<Table zoom={false} urls={['/t.png']} />)
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/^blob:/)
    expect(reads.filter((u) => u.endsWith('/t.png'))).toHaveLength(1)
  })
})

describe('IconText', () => {
  it('draws icons inline at text height, unknown markers as their name, and strips ids', () => {
    const { container } = render(<p><IconText text="Pay [[gold]] [[act]] [[res5]] (AR-12)." icons={icons} strip={(s) => s.replace(' (AR-12)', '')} /></p>)
    const svg = container.querySelector('svg[data-icon="gold"]') as SVGElement
    expect(svg.getAttribute('aria-label')).toBe('gold')
    expect(svg.style.height).toBe('1em')
    expect(container.querySelector('img[data-icon="act"]')?.getAttribute('alt')).toBe('action')
    expect(container.querySelector('.kc-unknown')?.textContent).toBe('res5')
    expect(container.textContent).not.toContain('AR-12')
  })
  it('gives each copy of an icon its own ids', () => {
    const set = { clip: { label: 'region', body: '<clipPath id="c"><rect/></clipPath><g clip-path="url(#c)"/><use href="#c"/>' } }
    const { container } = render(<p><IconText text="[[clip]] [[clip]]" icons={set} /></p>)
    const ids = [...container.querySelectorAll('clipPath')].map((e) => e.id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
    for (const svg of container.querySelectorAll('svg')) {
      const id = svg.querySelector('clipPath')?.id ?? ''
      expect(svg.querySelector('g')?.getAttribute('clip-path')).toBe(`url(#${id})`)
      expect(svg.querySelector('use')?.getAttribute('href')).toBe(`#${id}`)
    }
  })
  it('lets the game draw its icons', () => {
    const { container } = render(<IconText text="[[gold]]" icons={icons} renderIcon={(p) => <u>{p.label}!</u>} />)
    expect(container.querySelector('u')?.textContent).toBe('gold!')
  })
})
