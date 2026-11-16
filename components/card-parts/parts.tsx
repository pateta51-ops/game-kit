// The React parts a game builds its card face from (STCC CardFace, IconText, ArtProvider, Tokens). Unstyled: positions only.
import { useContext, useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { displayUrl, markUndecoded, prepareImages, retainImages } from './imageCache'
import { placeTokens, zoneBox, zonesInOrder, type CardLayout, type TokenAt, type Zone } from './layout'
import { BRACKETS, parseIconText, type IconDef, type IconSet, type Part, type Syntax } from './text'
import { ArtContext } from './art'

/** Class names of the parts (default `kc-<part>`): face, zone, art, icon, unknown, tokens, token. */
export type Cls = (part: string) => string
const kc: Cls = (p) => `kc-${p}`

/** The game's art (its own type) for every card below, and the decode-ahead of `urls` (STCC B44f): those draw only once decoded. */
export function ArtProvider<A>({ art, urls, fromCache, children }: {
  art: A
  urls?: readonly string[]
  fromCache?: (url: string) => Promise<Blob | null>
  children: ReactNode
}) {
  const [tick, setTick] = useState(0)
  const key = urls?.join('\n') ?? ''
  const list = useMemo(() => (key === '' ? [] : key.split('\n')), [key])
  useMemo(() => {
    markUndecoded(list)
  }, [list])
  useEffect(() => {
    if (list.length === 0) return
    let live = true
    const release = retainImages()
    void prepareImages({ urls: list, ...(fromCache ? { fromCache } : {}), onChange: () => { if (live) setTick((t) => t + 1) } })
    return () => {
      live = false
      release()
    }
  }, [list, fromCache])
  const value = useMemo(() => ({ art, tick }), [art, tick])
  return <ArtContext.Provider value={value}>{children}</ArtContext.Provider>
}

/** A card picture: `fallback` (the stand-in) while it decodes, when it fails, or with no address. */
export function ArtImage({ url, fallback = null, alt = '', className, cls = kc }: { url: string | null; fallback?: ReactNode; alt?: string; className?: string; cls?: Cls }) {
  useContext(ArtContext)
  const [failed, setFailed] = useState<string | null>(null)
  const src = url === null ? null : displayUrl(url)
  if (src === null || failed === src) return <>{fallback}</>
  return <img className={className ?? cls('art')} src={src} alt={alt} draggable={false} onError={() => { setFailed(src) }} />
}

export type ZoneContent = ReactNode | ((zone: Zone, name: string) => ReactNode)

/** The game's layout drawn: each zone it gives content for, at its place; `children` over all (a TokenLayer). */
export function CardFace({ layout, zones, className, style, cls = kc, children, ...data }: {
  layout: CardLayout
  zones: Readonly<Record<string, ZoneContent>>
  className?: string
  style?: CSSProperties
  cls?: Cls
  children?: ReactNode
} & { [k: `data-${string}`]: string | undefined }) {
  return (
    <div {...data} className={className ?? cls('face')} style={{ position: 'relative', aspectRatio: `${String(layout.w)} / ${String(layout.h)}`, containerType: 'inline-size', ...style }}>
      {zonesInOrder(layout).map(([name, z]) => {
        if (!(name in zones)) return null
        const c = zones[name]
        return (
          <div key={name} className={cls('zone')} data-zone={name} data-kind={z.kind} style={{ position: 'absolute', ...zoneBox(layout, z) }}>
            {typeof c === 'function' ? c(z, name) : c}
          </div>
        )
      })}
      {children}
    </div>
  )
}

/** Counters and markers on a card, at the layout's anchors (or a zone's centre), centred on their point. */
export function TokenLayer<T extends TokenAt>({ layout, tokens, render, cls = kc }: { layout: CardLayout; tokens: readonly T[]; render: (token: T, i: number) => ReactNode; cls?: Cls }) {
  const { placed } = placeTokens(layout, tokens)
  return (
    <div className={cls('tokens')} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {placed.map((p, i) => (
        <div key={i} className={cls('token')} data-anchor={p.token.anchor} style={{ position: 'absolute', left: p.left, top: p.top, transform: 'translate(-50%, -50%)', pointerEvents: 'auto' }}>
          {render(p.token, i)}
        </div>
      ))}
    </div>
  )
}

/** One icon of the set at text height (`size`, default 1em): inline SVG (follows `currentColor`), a picture, else its words. */
const ID_ATTR = /\bid="([^"]+)"/g

/** Imperium Icons.tsx: `body` with every id it defines, and every reference to one, given the suffix `-${uid}`. */
function withUniqueIds(body: string, uid: string): string {
  let out = body
  for (const [, id] of body.matchAll(ID_ATTR)) {
    if (id === undefined) continue
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`(id="|url\\(#|href="#)${esc}(?=[")])`, 'g'), `$1${id}-${uid}`)
  }
  return out
}

export function Icon({ def, name, size = '1em', cls = kc }: { def: IconDef; name: string; size?: string; cls?: Cls }) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, '')
  const style = { height: size, width: 'auto', verticalAlign: '-0.125em' }
  if (def.body !== undefined)
    return <svg className={cls('icon')} data-icon={name} viewBox={def.viewBox ?? '0 0 24 24'} role="img" aria-label={def.label} style={style} dangerouslySetInnerHTML={{ __html: `<title>${def.label.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</title>${def.body.includes('id="') ? withUniqueIds(def.body, uid) : def.body}` }} />
  if (def.src !== undefined) return <img className={cls('icon')} data-icon={name} src={def.src} alt={def.label} title={def.label} style={style} draggable={false} />
  return <span className={cls('icon')} data-icon={name}>{def.label}</span>
}

/** Printed text with its icons inline. `renderIcon` draws an icon the game's way; `strip` is plain-text's `ids.strip` for engine text. */
export function IconText({ text, icons, syntax = BRACKETS, size, renderIcon, strip, cls = kc }: {
  text: string
  icons: IconSet
  syntax?: Syntax
  size?: string
  renderIcon?: (part: Extract<Part, { t: 'icon' }>, def: IconDef | undefined) => ReactNode
  strip?: (s: string) => string
  cls?: Cls
}) {
  const parts = parseIconText(strip ? strip(text) : text, icons, syntax)
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === 'text') return <span key={i}>{p.s}</span>
        const def = icons[p.name]
        if (renderIcon) return <span key={i}>{renderIcon(p, def)}</span>
        if (!def) return <span key={i} className={cls('unknown')} data-icon={p.name}>{p.name}</span>
        return <Icon key={i} def={def} name={p.name} cls={cls} {...(size ? { size } : {})} />
      })}
    </>
  )
}
