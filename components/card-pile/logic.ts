// K219: the open / close / pick logic of a pile, as plain functions (ported from imperium-horizon-fan-prototype PeekPile.tsx:
// the mode changes, the pick-ended close, the Tab ring, the backdrop rule; STCC usePileFan.tsx: close on a changed pile).
import type { ZoneView } from '../card-zones/index.ts'
import type { Mark } from '../prompt-host/pick.ts'

export type Mode = 'rest' | 'fan' | 'gather'
export type Event = 'toggle' | 'changed' | 'done' | 'pickEnded' | 'close' | 'reset'

/** The fan's mode after an event; `cards` is how many cards the pile holds now. A fan with cards left gathers, else it is at rest. */
export function step(mode: Mode, ev: Event, cards: number): Mode {
  switch (ev) {
    case 'toggle':
      return mode === 'rest' ? (cards > 0 ? 'fan' : 'rest') : mode === 'fan' ? 'gather' : mode
    case 'changed':
      return mode === 'fan' && cards > 0 ? 'gather' : 'rest'
    case 'pickEnded':
    case 'close':
      return mode === 'fan' ? 'gather' : mode
    case 'done':
    case 'reset':
      return 'rest'
  }
}

/** The fan closes once the prompt no longer names its cards, but only after it did. */
export const pickEnded = (wasPicking: boolean, picking: boolean): boolean => wasPicking && !picking

/** A click on the backdrop gathers the cards, but not while they are still flying out. */
export const backdropCloses = (mode: Mode, landed: boolean): boolean => mode === 'fan' && landed

/** What the pile shows at rest and in its browse list, from a card-zones view (a `null` is a back; no id reaches the DOM for it). */
export interface PileModel {
  count: number
  /** The top card id, `null` for a back, `undefined` when the pile is empty. */
  top: string | null | undefined
  /** The cards the game says are public, index 0 on top; hidden ones are `null`. */
  cards: readonly (string | null)[]
  browsable: boolean
}
export function pileModel(view: ZoneView, browse = true): PileModel {
  const cards = view.cards ?? []
  const count = view.count ?? cards.length
  return { count, top: count === 0 ? undefined : (cards[0] ?? null), cards, browsable: browse && cards.length > 0 }
}

/** The ids of the pile's cards the prompt names (any mark), in pile order. */
export const named = (cards: readonly (string | null)[], marks: Readonly<Record<string, Mark>>): string[] =>
  cards.filter((c): c is string => c !== null && marks[c] !== undefined)

/** Where Tab goes inside the modal fan: round the ring, never out of it. */
export function nextInRing(size: number, at: number, back: boolean): number {
  return back ? (at <= 0 ? size - 1 : at - 1) : (at + 1) % size
}

/** The pile's name and size: "Discard pile, 12 cards", "Deck, empty". */
export const pileWords = (label: string, count: number, cardsWord = 'cards', emptyWord = 'empty'): string =>
  `${label}, ${count === 0 ? emptyWord : `${String(count)} ${cardsWord}`}`
