// K219: a pile's cards as a grid inside phone-mode's Sheet, top first, "Top" on the top card; a tap on a card the open prompt names picks
// it, any other tap asks for the card's detail. Ported from imperium-horizon-fan-prototype src/ui/board/phone/sheet/PileGrid.tsx.
import type { ReactNode } from 'react'
import { pickedAttrs } from '../picked-state/index.ts'
import type { Mark } from '../prompt-host/pick.ts'
import type { FaceInfo } from './Pile.tsx'

export function PileGrid({ label, cards, face, back, marks, tap, onDetail, topWord = 'Top', emptyWord = 'Empty' }: {
  label: string
  cards: readonly (string | null)[]
  face: (id: string, info: FaceInfo) => ReactNode
  back: (info: FaceInfo) => ReactNode
  marks: Readonly<Record<string, Mark>>
  tap: (id: string) => void
  onDetail?: ((id: string) => void) | undefined
  topWord?: string | undefined
  emptyWord?: string | undefined
}) {
  if (cards.length === 0) return <p data-part="grid-empty">{emptyWord}</p>
  const picking = cards.some((c) => c !== null && marks[c] !== undefined)
  const anyArmed = cards.some((c) => c !== null && marks[c] === 'armed')
  return (
    <ul data-part="grid" aria-label={label}>
      {cards.map((c, i) => {
        const m = c === null ? undefined : marks[c]
        const info: FaceInfo = { where: 'grid', top: i === 0 }
        return (
          <li key={c ?? `back-${String(i)}`} data-part="grid-cell">
            <button
              type="button"
              data-part="grid-card"
              data-card={c ?? undefined}
              data-mark={picking ? m : undefined}
              data-dim={picking && (m === undefined || m === 'barred') ? 'true' : undefined}
              {...(picking && c !== null ? pickedAttrs(m === 'armed', anyArmed) : {})}
              disabled={c === null}
              onClick={() => {
                if (c === null) return
                if (m !== undefined && m !== 'barred') tap(c)
                else onDetail?.(c)
              }}
            >
              {c === null ? back(info) : face(c, info)}
              {i === 0 ? <span data-part="grid-top">{topWord}</span> : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
