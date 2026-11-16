import { describe, expect, it } from 'vitest'
import {
  cacheNameFor, cachedBlobReader, retainImages, checkLayout, checkLayouts, displayUrl, fillImageCache, markUndecoded, mergeLayout, parseIconText, placeTokens,
  plainOf, prepareImages, releaseImages, unknownIcons, zoneBox, zonesInOrder, type CardLayout, type ImageBucket, type ImageStore,
} from './index.ts'

const PORTRAIT: CardLayout = {
  w: 1170, h: 1635,
  zones: { art: { x: 0, y: 0, w: 1170, h: 900, kind: 'art' }, name: { x: 50, y: 40, w: 800, h: 90, z: 2 }, text: { x: 55, y: 1000, w: 1045, h: 500 } },
  anchors: { damage: { x: 100, y: 950, dx: 60 } },
}
const LANDSCAPE: CardLayout = { w: 1056, h: 752, zones: { art: { x: 0, y: 0, w: 1056, h: 400 } } }

describe('layout data', () => {
  it('accepts portrait and landscape layouts', () => {
    expect(checkLayouts({ unit: PORTRAIT, location: LANDSCAPE })).toEqual([])
  })
  it('names each bad zone and anchor', () => {
    const bad: CardLayout = {
      w: 100, h: 50,
      zones: { a: { x: 90, y: 0, w: 20, h: 10 }, b: { x: 0, y: 0, w: 0, h: 10 }, c: { x: Number.NaN, y: 0, w: 1, h: 1 } },
      anchors: { a: { x: 10, y: 10 }, far: { x: 200, y: 10 } },
    }
    expect(checkLayout(bad, 'unit')).toEqual([
      'unit.zones.a: outside the card', 'unit.zones.b: empty', 'unit.zones.c: x, y, w, h must be numbers',
      'unit.anchors.a: a zone has the same name', 'unit.anchors.far: outside the card',
    ])
    expect(checkLayout({ w: 0, h: 10, zones: {} })).toEqual(['layout: size must be positive numbers'])
  })
  it('merges a card over its type, and boxes in percent', () => {
    const one = mergeLayout(PORTRAIT, { zones: { name: { w: 600 } } })
    expect(one.zones.name).toEqual({ x: 50, y: 40, w: 600, h: 90, z: 2 })
    expect(PORTRAIT.zones.name?.w).toBe(800)
    expect(zoneBox(LANDSCAPE, { x: 528, y: 0, w: 264, h: 376, rotate: 90 })).toEqual({ left: '50%', top: '0%', width: '25%', height: '50%', transform: 'rotate(90deg)' })
    expect(zonesInOrder(PORTRAIT).map(([n]) => n)).toEqual(['art', 'text', 'name'])
  })
})

describe('token placement', () => {
  it('steps tokens at one anchor, uses zone centres, reports unknown anchors', () => {
    const { placed, missing } = placeTokens(PORTRAIT, [{ anchor: 'damage', id: 1 }, { anchor: 'damage', id: 2 }, { anchor: 'name', id: 3 }, { anchor: 'nowhere', id: 4 }])
    expect(placed.map((p) => [p.token.id, p.x, p.y])).toEqual([[1, 100, 950], [2, 160, 950], [3, 450, 85]])
    expect(placed[0]?.left).toBe(`${String((100 / 1170) * 100)}%`)
    expect(missing.map((t) => t.id)).toEqual([4])
  })
})

describe('icon text', () => {
  const icons = { gold: { label: 'gold', body: '<circle r="5"/>' }, act: { label: 'action' } }
  it('splits text and known icons', () => {
    const parts = parseIconText('Pay [[gold]] [[ act ]]: draw.', icons)
    expect(parts).toEqual([
      { t: 'text', s: 'Pay ' }, { t: 'icon', name: 'gold', label: 'gold', known: true }, { t: 'text', s: ' ' },
      { t: 'icon', name: 'act', label: 'action', known: true }, { t: 'text', s: ': draw.' },
    ])
    expect(plainOf(parts)).toBe('Pay gold action: draw.')
  })
  it('keeps unknown markers by name and lists them', () => {
    expect(parseIconText('[[res5]]', icons)).toEqual([{ t: 'icon', name: 'res5', label: 'res5', known: false }])
    expect(unknownIcons(['[[gold]] [[res5]]', '[[res5]] [[x]]'], icons)).toEqual(['res5', 'x'])
  })
  it('reads escaped markers and unclosed ones as text', () => {
    expect(plainOf(parseIconText(String.raw`write \[[gold]] or \\[[gold]]`, icons))).toBe(String.raw`write [[gold]] or \gold`)
    expect(parseIconText('a [[gold', icons)).toEqual([{ t: 'text', s: 'a [[gold' }])
  })
  it('escapes only before a marker or the escape: other and lone backslashes stay', () => {
    expect(plainOf(parseIconText('a\\b c\\]] d\\\\', icons))).toBe('a\\b c]] d\\')
    expect(plainOf(parseIconText('end\\', icons))).toBe('end\\')
    expect(plainOf(parseIconText('\\', icons))).toBe('\\')
  })
  it('reads adjacent icons', () => {
    expect(parseIconText('[[gold]][[act]]', icons).map((p) => (p.t === 'icon' ? p.name : p.s))).toEqual(['gold', 'act'])
  })
  it('takes the game syntax', () => {
    expect(parseIconText('Gain [Gold].', { Gold: { label: 'gold' } }, { open: '[', close: ']' })[1]).toEqual({ t: 'icon', name: 'Gold', label: 'gold', known: true })
  })
})

function memoryStore(): ImageStore & { data: Map<string, Map<string, Blob>> } {
  const data = new Map<string, Map<string, Blob>>()
  return {
    data,
    names: () => Promise.resolve([...data.keys()]),
    remove: (n) => {
      data.delete(n)
      return Promise.resolve()
    },
    open: (n) => {
      const m = data.get(n) ?? new Map<string, Blob>()
      data.set(n, m)
      const bucket: ImageBucket = {
        list: () => Promise.resolve([...m].map(([url, b]) => ({ url, size: b.size }))),
        get: (url) => Promise.resolve(m.get(url) ?? null),
        put: (url, b) => {
          if (url.includes('full')) return Promise.reject(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))
          m.set(url, b)
          return Promise.resolve()
        },
      }
      return Promise.resolve(bucket)
    },
  }
}

describe('art cache', () => {
  it('fills what is missing, then drops older caches of the prefix', async () => {
    const store = memoryStore()
    store.data.set('g-old', new Map())
    store.data.set('other', new Map())
    const urls = ['https://x/a.png', 'https://x/b.png']
    const got = await fillImageCache({ store, prefix: 'g-', urls, fetchImage: (u) => Promise.resolve(new Blob([u])) })
    expect(got).toMatchObject({ have: 2, total: 2, quotaHit: false })
    expect([...store.data.keys()].sort()).toEqual([cacheNameFor(urls, 'g-'), 'other'])
    let fetched = 0
    await fillImageCache({ store, prefix: 'g-', urls, fetchImage: () => Promise.resolve(new Blob([String(++fetched)])) })
    expect(fetched).toBe(0)
  })
  it('stops on a full device and keeps the older caches', async () => {
    const store = memoryStore()
    store.data.set('g-old', new Map())
    const got = await fillImageCache({ store, prefix: 'g-', urls: ['https://x/full.png', 'https://x/b.png'], fetchImage: () => Promise.resolve(new Blob(['1'])), concurrency: 1 })
    expect(got.quotaHit).toBe(true)
    expect(store.data.has('g-old')).toBe(true)
  })
  it('hides a picture until decoded, and a failed decode shows the network copy', async () => {
    markUndecoded(['a.png', 'b.png'])
    expect(displayUrl('a.png')).toBeNull()
    let changes = 0
    await prepareImages({ urls: ['a.png', 'b.png'], decode: (s) => (s === 'a.png' ? Promise.resolve(null) : Promise.reject(new Error('x'))), onChange: () => { changes++ } })
    expect(displayUrl('a.png')).toBe('a.png')
    expect(displayUrl('b.png')).toBe('b.png')
    expect(changes).toBeGreaterThan(0)
    releaseImages()
  })
  it('reads the device cache: this set first, then an older cache of the prefix, and draws the cached copy', async () => {
    const store = memoryStore()
    const urls = ['https://x/a.png', 'https://x/b.png']
    store.data.set(cacheNameFor(urls, 'g-'), new Map([['https://x/a.png', new Blob(['new'])]]))
    store.data.set('g-old', new Map([['https://x/a.png', new Blob(['old'])], ['https://x/b.png', new Blob(['b'])]]))
    const read = cachedBlobReader(urls, 'g-', store)
    expect(read).toBeDefined()
    expect(await (await read?.('https://x/a.png'))?.text()).toBe('new')
    expect(await (await read?.('https://x/b.png'))?.text()).toBe('b')
    expect(await read?.('https://x/c.png')).toBeNull()
    expect(cachedBlobReader(urls, 'g-', null)).toBeUndefined()
    await prepareImages({ urls: ['https://x/a.png'], ...(read ? { fromCache: read } : {}), decode: () => Promise.resolve(null), onChange: () => undefined })
    expect(displayUrl('https://x/a.png')).toMatch(/^blob:/)
    releaseImages()
  })
  it('keeps decoded pictures until the last holder lets go', async () => {
    const a = retainImages()
    const b = retainImages()
    await prepareImages({ urls: ['https://x/a.png'], fromCache: () => Promise.resolve(new Blob(['a'])), decode: () => Promise.resolve(null), onChange: () => undefined })
    b()
    b()
    expect(displayUrl('https://x/a.png')).toMatch(/^blob:/)
    a()
    expect(displayUrl('https://x/a.png')).toBe('https://x/a.png')
  })
})
