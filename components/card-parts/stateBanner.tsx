// A diagonal state word over a card (STCC table.css .tag--exhausted @a69c8dac, ViewCard.tsx): bottom-left to top-right, as long as the card's diagonal.
// STCC's fixed 5.4 em for "EXHAUSTED" became the word's measured width in the game's own font (K350 fix).
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { Cls } from './parts.tsx'
import { bannerFit, LINE } from './bannerFit.ts'

const text: CSSProperties = { fontWeight: 700, lineHeight: LINE, fontFamily: 'var(--kc-banner-font, inherit)', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 0.1em 0 0.22em', whiteSpace: 'nowrap' }


/** The game's word (`word`, never fixed here) across the card on its diagonal, clipped to the card; put it last inside the positioned card. Letters are sized from the word's measured width so both ends stay inside. `grey` dims the face beneath (`--kc-banner-grey`). Look: `--kc-banner-bar|text|edge|font|grey`. `variant="line"`: only a thin diagonal stroke (`--kc-banner-line`, `--kc-banner-line-width`), no word. Bar with no word, nothing. Still, no animation. */
export function StateBanner({ word, grey, variant = 'bar', cls = (p) => `kc-${p}` }: { word?: string | null | undefined; grey?: boolean; variant?: 'bar' | 'line'; cls?: Cls }) {
  const box = useRef<HTMLDivElement>(null)
  const probe = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [em, setEm] = useState(0)
  useLayoutEffect(() => {
    const b = box.current, p = probe.current
    if (!b) return
    const measure = () => {
      setSize({ w: b.clientWidth, h: b.clientHeight })
      if (p) setEm(p.getBoundingClientRect().width / 100)
    }
    measure()
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(b)
    }
    void document.fonts?.ready.then(measure)
    return () => { ro?.disconnect() }
  }, [word, variant])
  const line = variant === 'line'
  if (!line && !word) return null
  const fs = bannerFit(size.w, size.h, em)
  const d = Math.hypot(size.w, size.h)
  const th = Math.atan2(size.h, size.w)
  return (
    <div ref={box} className={cls('state-banner')} data-part="state-banner" data-variant={variant} data-grey={grey ? '' : undefined} style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none', ...(grey ? { backdropFilter: 'var(--kc-banner-grey, saturate(0.15) brightness(0.6))' } : {}) }}>
      {line ? <span style={{ position: 'absolute', left: '50%', top: '50%', width: d, height: 'var(--kc-banner-line-width, 3px)', background: 'var(--kc-banner-line, rgba(255, 255, 255, 0.85))', transform: `translate(-50%, -50%) rotate(${String(-th)}rad)` }} /> : <><span ref={probe} aria-hidden style={{ ...text, position: 'absolute', visibility: 'hidden', fontSize: 100 }}>{word}</span>
      <span style={{
        ...text, position: 'absolute', left: '50%', top: '50%', width: d, textAlign: 'center', fontSize: fs, visibility: fs > 0 ? 'visible' : 'hidden',
        transform: `translate(-50%, -50%) rotate(${String(-th)}rad)`,
        color: 'var(--kc-banner-text, #fff)', background: 'var(--kc-banner-bar, rgba(6, 10, 18, 0.8))',
        borderBlock: `${String(fs * 0.03)}px solid var(--kc-banner-edge, rgba(255, 255, 255, 0.6))`,
      }}>{word}</span></>}
    </div>
  )
}
