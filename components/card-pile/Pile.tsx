// K219: a pile on the table. At rest: a stack (top card, edges of the cards beneath, empty slot), ported from imperium-horizon-fan-prototype
// Stack.tsx / Piles.tsx. A click fans the cards out (PeekPile.tsx: they leave one after another along a curve, gather back in reverse,
// the board greys behind a modal backdrop, focus moves in and returns, Tab cycles, Escape gathers, a pick from the pile marks the cards
// the prompt names and a click answers, the fan closes when the prompt no longer names its cards). On a phone the cards open in
// phone-mode's Sheet as a grid (PileGrid.tsx). Cards come from a card-zones ZoneView (null = a back); the faces are the game's.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './card-pile.css'
import type { ZoneView } from '../card-zones/index.ts'
import { prefersReducedMotion } from '../motion-frame/player.ts'
import { pickedAttrs } from '../picked-state/index.ts'
import type { BoardPick, Mark } from '../prompt-host/pick.ts'
import { PileGrid } from './PileGrid.tsx'
import { Sheet } from '../phone-mode/Sheet.tsx'
import {
  EASE_FLIGHT, MOTION, edgesFor, fanPlaces, flight, gatherFlight, holesPath, liftScale, liftShift, spreadOf, stepFor, totalMs,
  type Box, type Placed,
} from './fan.ts'
import { backdropCloses, named, nextInRing, pickEnded, pileModel, pileWords, step, type Mode } from './logic.ts'

export interface FaceInfo {
  where: 'top' | 'edge' | 'fan' | 'grid'
  /** True for the top card of the pile. */
  top: boolean
  /** K254: the card's mark and reason while a pick or `markOf` names it (for a cost badge, a "Choose" badge, a dim face). */
  mark?: string
  why?: string
}
/** K254: the game's props on a card's click target (fan-hit, grid-card); its `onClick`, `onFocus`, `onBlur` are composed (called first). */
export type CardProps = ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string | number | undefined>
export interface TapInfo {
  /** A key's click has `detail` 0. */
  via: 'pointer' | 'key'
  detail: number
}
export interface PileProps {
  label: string
  view: ZoneView
  /** The game's card face for a known card id. */
  face: (id: string, info: FaceInfo) => ReactNode
  /** The game's card back (a hidden card, or the edge of a card beneath). */
  back: (info: FaceInfo) => ReactNode
  /** From `useBoardPick(prompt, answer)`: the marks of the cards the prompt names and the tap that answers. */
  pick?: Pick<BoardPick, 'marks' | 'tap'>
  /** Animation speed factor (1 normal, 0 none); prefers-reduced-motion also gives none. */
  speed?: number
  /** false: the pile cannot be looked through (a face-down deck). */
  browse?: boolean
  /** Open in phone-mode's Sheet as a grid instead of the fan. */
  phone?: boolean
  /** Phone: a tap on a card that is not a pick (its detail). */
  onDetail?: (id: string) => void
  testId?: string
  /** K283: false drops the native `title` on the stack button (a game that draws its own tooltip). Default true. */
  hitTitle?: boolean
  /** Where the fan is drawn (default document.body). */
  host?: Element
  /** CSS selector of an element that stays lit and live through the backdrop while a pick is open (the decision panel). */
  show?: string
  /** `--u` in px (1/100 of the table height); default from the window. */
  unit?: () => number
  landscape?: boolean
  /** The game's words: the pile's name with its size, the pile button, the fan, the "top" word of the grid. */
  words?: { pile?: (label: string, count: number) => string; open?: (label: string) => string; pick?: (label: string, named: number) => string; fan?: (label: string) => string; top?: string; close?: string; empty?: string }
  /** K254: a mark and a reason per card, over the prompt's: `mark` replaces `data-mark` (any word; only `barred` is disabled, `dim` stays selectable), `why` is `data-why` and the card's title. */
  markOf?: (id: string) => { mark?: string; why?: string } | undefined
  /** K254: a tap with its event; replaces `pick.tap(id)` (call it yourself); a double-click's second click is never reported. */
  onTap?: (id: string, info: TapInfo) => void
  /** K254: the game's props on each card's click target (fan and grid). */
  cardProps?: (id: string, where: 'fan' | 'grid') => CardProps | undefined
  /** K254: the large-preview hook: a card (the top of the stack, a fanned card, a grid card) is hovered or focused (`id`), then left (`null`). The game draws the preview. */
  onPreview?: (id: string | null, where: 'top' | 'fan' | 'grid', el?: Element) => void
  /** K270: when `onPreview` fires with a card: `'hover'` (default, pointer only) or `'hover-focus'` (also keyboard focus; never on the focus return after the fan closes). */
  previewOn?: 'hover' | 'hover-focus'
  /** K254: drawn over the stack while the prompt names cards of the pile (the "Choose - N" badge), `data-part="pick-badge"`. */
  badge?: (named: number) => ReactNode
  /** Over the stack (a count badge, a marker). */
  children?: ReactNode
}

const defaultUnit = (): number => Math.min(window.innerHeight / 100, (window.innerWidth * 0.5625) / 100)
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
const NONE: Record<string, never> = {}

export function Pile(p: PileProps) {
  const { label, view, face, back, pick, speed = 1, browse = true, phone = false, testId, show, landscape = false } = p
  const motion = prefersReducedMotion() ? 0 : speed
  const unit = p.unit ?? defaultUnit
  const model = pileModel(view, browse)
  const { markOf, onTap, cardProps, onPreview } = p
  const returning = useRef(false)
  const onFocusPreview = (id: string, where: 'top' | 'fan' | 'grid', el: Element) => {
    if (p.previewOn === 'hover-focus' && !returning.current) onPreview?.(id, where, el)
  }
  const base = pick?.marks ?? NONE
  const whys: Record<string, string | undefined> = {}
  const marks: Record<string, Mark> = { ...base }
  for (const c of model.cards) {
    const x = c === null ? undefined : markOf?.(c)
    if (c !== null && x !== undefined) {
      if (x.mark !== undefined) marks[c] = x.mark as Mark
      whys[c] = x.why
    }
  }
  const ids = model.cards.map((c) => c ?? '')
  const names = named(model.cards, marks)
  const picking = names.length > 0
  const pileRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const tookFocus = useRef(false)
  const wasPicking = useRef(false)
  const [mode, setMode] = useState<Mode>('rest')
  const [fan, setFan] = useState<{ cards: readonly (string | null)[]; places: Placed[]; holes: Box[] } | null>(null)
  const [lifted, setLifted] = useState<number | null>(null)
  const [landed, setLanded] = useState(false)
  const [host, setHost] = useState<Element | null>(null)
  const [sheet, setSheet] = useState(false)
  const closeSheet = () => { returning.current = true; setSheet(false) }
  useEffect(() => { returning.current = false })
  const n = model.cards.length

  const previewRef = useRef(onPreview)
  useEffect(() => {
    previewRef.current = onPreview
  })
  useEffect(() => () => previewRef.current?.(null, 'top'), [model.browsable])
  useEffect(() => () => { if (sheet) previewRef.current?.(null, 'grid') }, [sheet])
  const rest = useCallback(() => {
    previewRef.current?.(null, 'fan')
    setMode('rest')
    setFan(null)
    setLifted(null)
  }, [])
  const send = (ev: Parameters<typeof step>[1]): void => setMode((m) => step(m, ev, n))

  // a card that leaves or joins the pile: the open cards gather back (those still in it)
  const key = ids.join(' ') + '|' + String(model.count)
  const [shown, setShown] = useState(key)
  if (shown !== key) {
    setShown(key)
    setLifted(null)
    if (mode === 'fan' && n > 0) send('changed')
    else {
      setMode('rest')
      setFan(null)
    }
    if (n === 0) setSheet(false)
  }

  const open = (): void => {
    const el = pileRef.current
    if (el === null || n === 0) return
    if (phone) return setSheet(true)
    const u = unit()
    const stackEl = el.querySelector('[data-part="stack"]')
    const anchor = boxOf(stackEl ?? el)
    const panel = picking && show !== undefined ? document.querySelector(show) : null
    const screen = { width: window.innerWidth, height: window.innerHeight }
    const places = fanPlaces(n, anchor, u, screen, panel === null || boxOf(panel).y < screen.height / 2 ? undefined : boxOf(panel).y - u)
    const depth = (i: number): Box => {
      const d = el.querySelector(`[data-depth="${String(Math.min(i, edgesFor(model.count)))}"]`)
      return d === null ? anchor : boxOf(d)
    }
    setHost(p.host ?? document.body)
    setFan({ cards: model.cards, places: places.map((pl, i) => ({ ...pl, from: depth(i) })), holes: panel === null ? [] : [boxOf(panel)] })
    setLifted(null)
    setLanded(motion === 0 || typeof document.body.animate !== 'function')
    setMode('fan')
  }
  const toggle = (e: { detail: number }): void => {
    if (e.detail > 1) return
    if (sheet) return closeSheet()
    if (mode === 'rest') open()
    else send('toggle')
  }

  // the fan opened for a pick closes once the prompt names none of the pile's cards any more
  useEffect(() => {
    if (mode !== 'fan' && !sheet) {
      wasPicking.current = false
      return
    }
    if (picking) wasPicking.current = true
    else if (pickEnded(wasPicking.current, picking)) {
      wasPicking.current = false
      closeSheet()
      setLifted(null)
      setMode((m) => step(m, 'pickEnded', n))
    }
  }, [picking, mode, sheet, n])

  // Escape gathers; Tab goes round the fan (and the shown panel), never behind the backdrop; a resize drops the fan
  useEffect(() => {
    if (mode !== 'fan') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setLifted(null)
        send('close')
        return
      }
      if (e.key !== 'Tab') return
      const panel = picking && show !== undefined ? document.querySelector(show) : null
      const root = overlayRef.current
      const reach = [...(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []), ...(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      const ring = reach.length > 0 || root === null ? reach : [root]
      if (ring.length === 0) return
      e.preventDefault()
      ring[nextInRing(ring.length, ring.indexOf(document.activeElement as HTMLElement), e.shiftKey)]?.focus()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', rest)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', rest)
    }
  }, [mode, picking, show, rest]) // eslint-disable-line react-hooks/exhaustive-deps

  // focus into the fan (the first named card, else the fan), and back to the pile's button when the cards are back
  useEffect(() => {
    const root = overlayRef.current
    if (mode === 'fan' && root !== null && !tookFocus.current) {
      tookFocus.current = true
      ;(root.querySelector<HTMLElement>('[data-part="fan-hit"][data-mark]:not([data-mark="barred"])') ?? root).focus({ preventScroll: true })
    }
    if (mode === 'rest' && tookFocus.current) {
      tookFocus.current = false
      const a = document.activeElement
      if (a === null || a === document.body || !document.contains(a)) {
        returning.current = true
        buttonRef.current?.focus({ preventScroll: true })
        returning.current = false
      }
    }
  }, [mode])

  // fly out
  useLayoutEffect(() => {
    const root = overlayRef.current
    if (mode !== 'fan' || fan === null || root === null || motion === 0 || typeof root.animate !== 'function') return
    const u = unit()
    const m = fan.places.length
    const st = stepFor(m)
    const flying: Animation[] = []
    for (const el of root.querySelectorAll<HTMLElement>('[data-fan-depth]')) {
      const i = Number(el.dataset.fanDepth)
      const pl = fan.places[i]
      if (pl !== undefined) flying.push(el.animate(flight(pl, i, m, u), { duration: MOTION.fly * motion, delay: i * st * motion, easing: EASE_FLIGHT, fill: 'both' }))
    }
    root.querySelector('[data-part="backdrop"]')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.backdrop * motion, fill: 'backwards' })
    let live = true
    const land = (): void => {
      if (live) setLanded(true)
    }
    let timer = 0
    const watch = (): void => {
      if (flying.some((a) => a.playState === 'running')) timer = window.setTimeout(watch, 150)
      else land()
    }
    timer = window.setTimeout(watch, totalMs(m, motion) + 150)
    void Promise.all(flying.map((a) => a.finished)).then(land).catch(() => undefined)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [mode, fan, motion]) // eslint-disable-line react-hooks/exhaustive-deps

  // gather: the cards fly back into the pile, the last one first
  useLayoutEffect(() => {
    if (mode !== 'gather') return
    const root = overlayRef.current
    if (fan === null || root === null || motion === 0 || typeof root.animate !== 'function') {
      rest()
      return
    }
    const u = unit()
    const m = fan.places.length
    const st = stepFor(m)
    const running: Animation[] = []
    for (const el of root.querySelectorAll<HTMLElement>('[data-fan-depth]')) {
      const i = Number(el.dataset.fanDepth)
      const pl = fan.places[i]
      if (pl !== undefined) running.push(el.animate(gatherFlight(pl, i, m, u), { duration: MOTION.fly * motion, delay: (m - 1 - i) * st * motion, easing: EASE_FLIGHT, fill: 'forwards' }))
    }
    const total = totalMs(m, motion)
    root.querySelector('[data-part="backdrop"]')?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.backdrop * motion, delay: Math.max(0, total - MOTION.backdrop * motion), fill: 'forwards' })
    let live = true
    const done = (): void => {
      if (live) rest()
    }
    let timer = 0
    const watch = (): void => {
      if (running.some((a) => a.playState === 'running')) timer = window.setTimeout(watch, 150)
      else done()
    }
    timer = window.setTimeout(watch, total + 150)
    void Promise.all(running.map((a) => a.finished)).then(done).catch(() => undefined)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [mode, fan, motion, rest]) // eslint-disable-line react-hooks/exhaustive-deps

  const isOpen = mode !== 'rest'
  const w = p.words ?? {}
  const wordsOf = (w.pile ?? ((l, c) => pileWords(l, c)))(label, model.count)
  const edges = model.top === undefined ? 0 : edgesFor(model.count)
  const topNode = model.top === undefined ? null : model.top === null ? back({ where: 'top', top: true }) : face(model.top, { where: 'top', top: true })
  const u = typeof window === 'undefined' ? 0 : unit()
  const liftedPlace = lifted === null ? undefined : fan?.places[lifted]
  const anyArmed = model.cards.some((c) => c !== null && marks[c] === 'armed')
  const markAttrs = (c: string | null): Record<string, string | undefined> =>
    c === null || !picking ? {} : { 'data-mark': marks[c], ...(whys[c] === undefined ? {} : { 'data-why': whys[c], title: whys[c] }), 'data-dim': marks[c] === undefined || marks[c] === 'barred' ? 'true' : undefined, ...pickedAttrs(marks[c] === 'armed', anyArmed) }
  const tap = (c: string | null, e: { detail: number }): void => {
    if (mode !== 'fan' || !landed || e.detail > 1) return
    if (c !== null && marks[c] !== undefined && marks[c] !== 'barred') {
      if (onTap === undefined) pick?.tap(c)
      else onTap(c, { via: e.detail > 0 ? 'pointer' : 'key', detail: e.detail })
    }
  }
  const info = (where: FaceInfo['where'], top: boolean, c: string | null): FaceInfo => (c === null || marks[c] === undefined ? { where, top } : { where, top, mark: marks[c], ...(whys[c] === undefined ? {} : { why: whys[c] }) })

  const overlay =
    host === null || fan === null || mode === 'rest'
      ? null
      : createPortal(
          <div
            ref={overlayRef}
            data-part="fan"
            data-mode={mode}
            data-opening={mode === 'fan' && !landed ? 'true' : undefined}
            data-pile-fan={testId}
            role="dialog"
            aria-modal="true"
            aria-label={(w.fan ?? ((l) => `${l}, fanned out`))(label)}
            tabIndex={-1}
            style={{ '--kp-hover-ms': `${String(Math.round(MOTION.hover * motion))}ms`, '--kp-lift-scale': fan.places[0] === undefined ? 1 : liftScale(fan.places[0], u) } as CSSProperties}
          >
            <div
              data-part="backdrop"
              data-holes={fan.holes.length}
              style={{ clipPath: holesPath(fan.holes) }}
              onClick={() => {
                if (backdropCloses(mode, landed)) {
                  setLifted(null)
                  send('close')
                }
              }}
            />
            <ol data-part="fan-cards">
              {fan.cards.map((c, i) => {
                const pl = fan.places[i]
                if (pl === undefined || (mode === 'gather' && c !== null && !ids.includes(c))) return null
                const hit = c !== null && marks[c] !== undefined && marks[c] !== 'barred'
                return (
                  <li
                    key={c ?? `back-${String(i)}`}
                    data-part="fan-card"
                    data-fan-depth={i}
                    data-card={c ?? undefined}
                    data-lifted={lifted === i ? 'true' : undefined}
                    style={{ left: pl.box.x, top: pl.box.y, zIndex: fan.cards.length + i, '--kp-card-w': `${String(pl.box.w)}px`, '--kp-card-h': `${String(pl.box.h)}px` } as CSSProperties}
                  >
                    <div
                      data-part="fan-turn"
                      style={{ '--turn': `${String(pl.turn)}deg`, '--spread': `${String(spreadOf(pl, liftedPlace, u))}px` } as CSSProperties}
                      onPointerEnter={() => {
                        if (mode !== 'fan') return
                        setLifted(i)
                        if (c !== null) onPreview?.(c, 'fan', overlayRef.current ?? undefined)
                      }}
                      onPointerLeave={() => {
                        setLifted((was) => (was === i ? null : was))
                        if (c !== null) onPreview?.(null, 'fan')
                      }}
                    >
                      <div
                        data-part="fan-lift"
                        style={{ '--lift-x': `${String(lifted === i ? liftShift(pl, u, { width: window.innerWidth, height: window.innerHeight }).x : 0)}px`, '--lift-y': `${String(lifted === i ? liftShift(pl, u, { width: window.innerWidth, height: window.innerHeight }).y : 0)}px` } as CSSProperties}
                      >
                        <button
                          {...(c === null ? {} : cardProps?.(c, 'fan'))}
                          type="button"
                          data-part="fan-hit"
                          disabled={!hit && picking}
                          aria-disabled={!hit}
                          onFocus={(e) => {
                            if (c === null) return
                            onFocusPreview(c, 'fan', e.currentTarget)
                            cardProps?.(c, 'fan')?.onFocus?.(e)
                          }}
                          onBlur={(e) => {
                            if (c === null) return
                            onPreview?.(null, 'fan')
                            cardProps?.(c, 'fan')?.onBlur?.(e)
                          }}
                          onClick={(e) => {
                            if (c !== null) cardProps?.(c, 'fan')?.onClick?.(e)
                            tap(c, e)
                          }}
                          {...markAttrs(c)}
                        >
                          {c === null ? back(info('fan', i === 0, null)) : face(c, info('fan', i === 0, c))}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>,
          host,
        )

  return (
    <div ref={pileRef} data-part="pile" data-testid={testId} data-pile={testId} data-count={model.count} data-mode={mode} data-picking={picking ? 'true' : undefined} data-named={names.length}>
      <div
        data-part="stack"
        data-landscape={landscape ? 'true' : undefined}
        data-empty={model.top === undefined ? 'true' : 'false'}
        data-edges={edges}
        style={{ '--edges': edges } as CSSProperties}
        role="group"
        aria-label={wordsOf}
        title={wordsOf}
      >
        {Array.from({ length: edges }, (_, j) => edges - j).map((k) => (
          <div key={k} data-part="stack-card" data-depth={k} style={{ '--k': k } as CSSProperties} aria-hidden="true">
            {(() => {
              const c = model.cards[k]
              return c === null || c === undefined ? back({ where: 'edge', top: false }) : face(c, { where: 'edge', top: false })
            })()}
          </div>
        ))}
        {model.top === undefined ? null : (
          <div data-part="stack-card" data-depth={0} style={{ '--k': 0 } as CSSProperties}>
            {topNode}
          </div>
        )}
        {model.browsable ? (
          <button ref={buttonRef} type="button" data-part="stack-hit" aria-expanded={isOpen || sheet} aria-label={picking && w.pick !== undefined ? w.pick(label, names.length) : (w.open ?? ((l) => `Look through the ${l}`))(label)} title={p.hitTitle === false ? undefined : picking && w.pick !== undefined ? w.pick(label, names.length) : wordsOf} onClick={toggle} onPointerEnter={() => model.top != null && onPreview?.(model.top, 'top', buttonRef.current ?? undefined)} onPointerLeave={() => onPreview?.(null, 'top')} onFocus={() => model.top != null && buttonRef.current !== null && onFocusPreview(model.top, 'top', buttonRef.current)} onBlur={() => onPreview?.(null, 'top')} />
        ) : null}
        {picking && p.badge !== undefined ? <span data-part="pick-badge" aria-hidden="true">{p.badge(names.length)}</span> : null}
        {p.children}
      </div>
      {overlay}
      {sheet ? (
        <Sheet title={label} onClose={() => closeSheet()} {...(motion === 0 ? { slideMs: 0 } : {})} {...(w.close === undefined ? {} : { closeLabel: w.close })}>
          <PileGrid label={label} cards={model.cards} face={face} back={back} marks={marks} onTap={onTap !== undefined} tap={(id, e) => (onTap === undefined ? pick?.tap(id) : onTap(id, e))} whys={whys} cardProps={cardProps} onPreview={onPreview} onFocusPreview={onFocusPreview} onDetail={p.onDetail} topWord={w.top} emptyWord={w.empty} />
        </Sheet>
      ) : null}
    </div>
  )
}
