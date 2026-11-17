export interface Box { turned?: boolean }
export interface Tuck { dx: number; dy: number }
export interface Spot { x: number; y: number }
export interface Size { w: number; h: number }

/** An attachment's step under its host, as fractions of the card's width and height. */
export const TUCK: Tuck = { dx: 0.14, dy: 0.15 }

export const faceBox = (b: Box, cw: number, ch: number): Size => (b.turned ? { w: ch, h: cw } : { w: cw, h: ch })

/** A tucked attachment turns with a turned host, so the two never cross; slid out it shows its own state. */
export const tuckedTurned = (host: Box, a: Box): boolean => !!(a.turned || host.turned)
const tuckBox = (host: Box, a: Box, cw: number, ch: number): Size => faceBox({ turned: tuckedTurned(host, a) }, cw, ch)

export const tuckOffset = (i: number, cw: number, ch: number, tuck: Tuck = TUCK): Spot => ({ x: Math.round((i + 1) * cw * tuck.dx), y: Math.round((i + 1) * ch * tuck.dy) })

/** Where each attachment lies under its host (host at 0,0): each shows one step beyond the card above, along the right and bottom, so every one shows an L. */
export function tuckSpots(host: Box, attachments: readonly Box[], cw: number, ch: number, tuck: Tuck = TUCK): Spot[] {
  const step = tuckOffset(0, cw, ch, tuck)
  let above = { x: 0, y: 0, ...faceBox(host, cw, ch) }
  return attachments.map((a) => {
    const b = tuckBox(host, a, cw, ch)
    const x = Math.max(above.x + step.x, above.x + above.w + step.x - b.w)
    const y = Math.max(above.y + step.y, above.y + above.h + step.y - b.h)
    above = { x, y, ...b }
    return { x, y }
  })
}

/** The box of a host and the cards tucked under it. */
export function footprint(host: Box, attachments: readonly Box[], cw: number, ch: number, tuck: Tuck = TUCK): Size {
  let { w, h } = faceBox(host, cw, ch)
  const spots = tuckSpots(host, attachments, cw, ch, tuck)
  attachments.forEach((a, i) => {
    const b = tuckBox(host, a, cw, ch)
    w = Math.max(w, spots[i]!.x + b.w)
    h = Math.max(h, spots[i]!.y + b.h)
  })
  return { w, h }
}

/** The width the attachments take slid out beside the host. */
export const outSpan = (attachments: readonly Box[], cw: number, ch: number, gap = 12): number => attachments.reduce((s, a) => s + faceBox(a, cw, ch).w + gap, 0)

/** Slid out: a row right of the host (or left, nearest first), tops level with the host's. */
export function outSpots(host: Box, attachments: readonly Box[], cw: number, ch: number, side: 'right' | 'left' = 'right', gap = 12): Spot[] {
  let edge = side === 'right' ? faceBox(host, cw, ch).w + gap : 0
  return attachments.map((a) => {
    const w = faceBox(a, cw, ch).w
    const x = side === 'right' ? edge : edge - gap - w
    edge = side === 'right' ? edge + w + gap : x
    return { x, y: 0 }
  })
}

/** Which side the slid-out row takes: right unless the zone has no room there and more on the left. `hostX` is the host's left edge, `scale` the drawn scale. */
export function outSide(hostX: number, host: Box, attachments: readonly Box[], cw: number, ch: number, zone: { x: number; w: number }, scale = 1, gap = 12): 'right' | 'left' {
  const span = outSpan(attachments, cw, ch, gap) * scale
  const right = zone.x + zone.w - (hostX + faceBox(host, cw, ch).w * scale + span)
  const left = hostX - span - zone.x
  return right >= 0 || right >= left ? 'right' : 'left'
}

export type FanDir = 'up' | 'down' | 'left' | 'right'

/** A fan: each attachment peeks out `step` (a fraction of the card's height, or width for left and right) further than the one before; host at 0,0. */
export function fanSpots(n: number, cw: number, ch: number, opts: { step?: number; dir?: FanDir } = {}): Spot[] {
  const { step = 0.12, dir = 'up' } = opts
  return Array.from({ length: n }, (_, i) => {
    const d = Math.round((i + 1) * step * (dir === 'up' || dir === 'down' ? ch : cw))
    return dir === 'up' ? { x: 0, y: -d } : dir === 'down' ? { x: 0, y: d } : dir === 'left' ? { x: -d, y: 0 } : { x: d, y: 0 }
  })
}

/** The box of a fanned stack and where the host stands in it. */
export function fanFootprint(n: number, cw: number, ch: number, opts: { step?: number; dir?: FanDir } = {}): Size & { host: Spot } {
  const spots = fanSpots(n, cw, ch, opts)
  const minX = Math.min(0, ...spots.map((s) => s.x))
  const minY = Math.min(0, ...spots.map((s) => s.y))
  const maxX = Math.max(0, ...spots.map((s) => s.x))
  const maxY = Math.max(0, ...spots.map((s) => s.y))
  return { w: cw + maxX - minX, h: ch + maxY - minY, host: { x: 0 - minX, y: 0 - minY } }
}
