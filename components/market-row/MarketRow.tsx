// K243: a market row on the table. Base: Unstoppable src/ui/board/Market.tsx (the slots, an empty slot part, the deck
// size beside them); the faces, price labels and look are the game's. Picks from prompt-host useBoardPick; new cards are
// dealt from the deck element with a stagger and survivors slide (deal.ts), none at speed 0 or reduced motion.
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { prefersReducedMotion } from '../motion-frame/player.ts'
import { pickedAttrs } from '../picked-state/index.ts'
import type { BoardPick } from '../prompt-host/pick.ts'
import type { FlipOpts } from '../deck-motions/plan.ts'
import { dealFlipFrames, flyFrames, rowMotions, type Box } from './deal.ts'
import type { MarketEvent, RowView } from './market.ts'

export interface MarketRowProps {
  /** The row's name in the engine (option ids `buy:<name>:<i>`). */
  name: string
  label: string
  row: RowView
  face: (id: string, slot: number) => ReactNode
  /** A deck: the game's back with its count. Default: the count. */
  deck?: (zone: string, count: number) => ReactNode
  /** An empty slot. Default: nothing inside the slot. */
  empty?: (slot: number) => ReactNode
  /** Under a card: its price and cycle cost, as the game writes them. */
  labels?: (slot: number, id: string) => ReactNode
  pick?: Pick<BoardPick, 'marks' | 'tap'>
  /** The option a click on the slot taps; default `buy:<name>:<slot>`. */
  optionFor?: (slot: number, id: string) => string
  /** K251: the option a click on the top offer taps; default `buy:<name>:top`. The top is drawn on the first deck, `face(id, -1)`, `data-offer="top"`. */
  topOption?: (id: string) => string
  /** The deck a new card in this slot is dealt from; default the row's first deck. */
  dealFrom?: (slot: number, id: string) => string
  /** The market events of the last step: a `filled` card is dealt from its `from` deck. */
  events?: readonly MarketEvent[]
  /** Animation speed factor (1 normal, 0 none). */
  speed?: number
  /** K406: a new card turns over from the face-down deck (default; options tune it); false: the deck is face up. Default false when the row shows a top offer. */
  flip?: boolean | FlipOpts | undefined
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

export function MarketRow({ name, label, row, face, deck, empty, labels, pick, optionFor, topOption, dealFrom, events, speed = 1, flip }: MarketRowProps) {
  const root = useRef<HTMLElement>(null)
  const prev = useRef(row.slots)
  const prevBoxes = useRef<Box[]>([])
  const decks = Object.keys(row.decks)
  const anyPicked = pick !== undefined && Object.values(pick.marks).includes('armed')
  useLayoutEffect(() => {
    const el = root.current
    const before = prev.current
    prev.current = row.slots
    if (!el) return
    const slots = [...el.querySelectorAll<HTMLElement>('[data-part="slot"]')]
    const old = prevBoxes.current
    prevBoxes.current = slots.map((x) => boxOf(x.querySelector('[data-part="card"]') ?? x))
    const sp = prefersReducedMotion() ? 0 : speed
    for (const m of rowMotions(before, row.slots, sp)) {
      const card = slots[m.to]?.querySelector<HTMLElement>('[data-part="card"]')
      if (!card || typeof card.animate !== 'function') continue
      const src = m.from === undefined ? el.querySelector(`[data-deck="${dealFrom?.(m.to, m.card) ?? events?.find((e): e is Extract<MarketEvent, { kind: 'filled' }> => e.kind === 'filled' && e.card === m.card && e.row === name)?.from ?? decks[0] ?? ''}"]`) : null
      const from = m.from === undefined ? (src ? boxOf(src) : undefined) : old[m.from]
      const to = boxOf(card)
      if (!from || from.w === 0 || to.w === 0) continue
      const turn = flip ?? row.top == null
      if (src && turn !== false) {
        const fr = dealFlipFrames(from, to, turn === true ? {} : turn)
        const back = ((src.firstElementChild ?? src).cloneNode(true)) as HTMLElement
        back.removeAttribute('data-part')
        back.dataset['motionStandin'] = ''
        Object.assign(back.style, { position: 'fixed', left: `${String(to.x)}px`, top: `${String(to.y)}px`, width: `${String(to.w)}px`, height: `${String(to.h)}px`, margin: '0', pointerEvents: 'none', zIndex: '1000', boxSizing: 'border-box' })
        document.body.append(back)
        const opts = { duration: m.ms, delay: m.delay, easing: 'ease-in-out', fill: 'both' as const }
        const a = back.animate(fr.back, opts)
        void (a as Animation | undefined)?.finished.catch(() => undefined).then(() => { back.remove() })
        card.animate(fr.face, { ...opts, fill: 'backwards' })
        continue
      }
      card.animate(flyFrames(from, to), { duration: m.ms, delay: m.delay, easing: 'ease-in-out', fill: 'backwards' })
    }
  }, [row.slots]) // eslint-disable-line react-hooks/exhaustive-deps
  const topCard = (id: string) => {
    const opt = topOption?.(id) ?? `buy:${name}:top`
    const mark = pick?.marks[opt]
    return (
      <div data-part="card" data-offer="top" data-card={id} {...(mark ? { 'data-mark': mark, ...pickedAttrs(mark === 'armed', anyPicked) } : pick ? { 'data-dim': 'true' } : {})}
        {...(mark && mark !== 'barred' ? { role: 'button', tabIndex: 0, onClick: () => pick?.tap(opt), onKeyDown: (e: { key: string }) => { if (e.key === 'Enter' || e.key === ' ') pick?.tap(opt) } } : {})}>
        {face(id, -1)}
      </div>
    )
  }
  return (
    <section ref={root} data-part="market-row" data-row={name} aria-label={label}>
      <div data-part="decks">
        {decks.map((z) => (
          <div key={z} data-part="deck" data-deck={z} data-count={row.decks[z]}>
            {deck ? deck(z, row.decks[z] ?? 0) : row.decks[z]}
            {z === decks[0] && row.top != null && topCard(row.top)}
          </div>
        ))}
      </div>
      <ul data-part="slots">
        {row.slots.map((id, slot) => {
          if (id === null) return <li key={slot} data-part="slot" data-slot={slot} data-empty="true">{empty?.(slot)}</li>
          const opt = optionFor?.(slot, id) ?? `buy:${name}:${String(slot)}`
          const mark = pick?.marks[opt]
          return (
            <li key={slot} data-part="slot" data-slot={slot}>
              <div data-part="card" data-card={id} {...(mark ? { 'data-mark': mark, ...pickedAttrs(mark === 'armed', anyPicked) } : pick ? { 'data-dim': 'true' } : {})}
                {...(mark && mark !== 'barred' ? { role: 'button', tabIndex: 0, onClick: () => pick?.tap(opt), onKeyDown: (e: { key: string }) => { if (e.key === 'Enter' || e.key === ' ') pick?.tap(opt) } } : {})}>
                {face(id, slot)}
              </div>
              {labels?.(slot, id)}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
