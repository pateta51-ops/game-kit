import type { ReactNode } from 'react'
import type { ZoneView } from '../card-zones/index.ts'
import { planBoard, type BoardPlanOpts, type Placed, type ZonePlan } from './geometry.ts'
import './player-board.css'

export interface SlotInfo { zone: string; id: string | null; index: number; scale: number; fan: boolean; plan: Placed<unknown> }
export interface PlayerBoardProps extends BoardPlanOpts {
  /** board-layout ZoneLayout: `w`, `h` and `zones[id].r = [x, y, w, h]`, design pixels. */
  layout: { w: number; h: number; zones: Record<string, { r: readonly number[] }> }
  /** Cards per zone id (a card-zones ZoneView). */
  views: Readonly<Record<string, ZoneView | undefined>>
  /** The mat image under the zones. */
  mat?: string
  /** Rem per design pixel (default 1/32): a table scale grows everything. */
  rem?: number
  /** Zone ids to draw (default: all in the layout). */
  only?: readonly string[]
  /** The game draws the card (or its back for `id === null`) in its slot, sized by the slot. */
  slot: (s: SlotInfo) => ReactNode
  /** Extra content inside a zone (a label, a count). */
  zoneExtra?: (zone: string, plan: ZonePlan) => ReactNode
}

/** A mat with named zones; each zone is a motion anchor (`data-zone`, `data-place`) and holds card slots the game fills. */
export function PlayerBoard(p: PlayerBoardProps) {
  const k = p.rem ?? 1 / 32
  const r = (n: number) => `${n * k}rem`
  const ids = (p.only ?? Object.keys(p.layout.zones)).filter((id) => p.layout.zones[id])
  const plan = planBoard(Object.fromEntries(ids.map((id) => [id, p.layout.zones[id]!.r])), Object.fromEntries(ids.map((id) => [id, p.views[id]?.cards])), p)
  return (
    <div data-part="player-board" style={{ position: 'relative', width: r(p.layout.w), height: r(p.layout.h) }}>
      {p.mat && <img data-part="mat" src={p.mat} alt="" />}
      {ids.map((id) => {
        const z = plan[id]!
        return (
          <div key={id} data-part="zone" data-zone={id} data-place={id} data-count={z.placed.length} data-rows={z.rows} data-fan={z.fan || undefined}
            style={{ position: 'absolute', left: r(z.rect.x), top: r(z.rect.y), width: r(z.rect.w), height: r(z.rect.h) }}>
            {p.zoneExtra?.(id, z)}
            {z.placed.map((c, i) => (
              <div key={c.item.index} data-part="slot" data-index={c.item.index} data-overlap={c.overlap || undefined}
                style={{ position: 'absolute', left: r(c.x - z.rect.x), top: r(c.y - z.rect.y), width: r(c.w), height: r(c.h), zIndex: i }}>
                {p.slot({ zone: id, id: c.item.id, index: c.item.index, scale: z.scale ?? 1, fan: z.fan, plan: c })}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
