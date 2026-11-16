// A card face's layout as data, the game's own (STCC faces.ts geometry in photo pixels, merged default + per-card over).
export interface Point { x: number; y: number }
/** A named place for counters: where the first sits, and the step to each next one (card units). */
export interface Anchor extends Point { dx?: number; dy?: number }
export interface Zone {
  x: number; y: number; w: number; h: number
  /** The game's word for what is drawn there ('art', 'text', 'cost'...); the face never reads it. */
  kind?: string
  /** Degrees, about the zone's centre (a banner turned on its side). */
  rotate?: number
  /** Drawing order; higher on top (default: the order of `zones`). */
  z?: number
}
/** One card type's face in its own units: any size, portrait or landscape. */
export interface CardLayout {
  w: number; h: number
  zones: Record<string, Zone>
  anchors?: Record<string, Anchor>
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** Every problem of a layout as a line; `[]` when it is good. */
export function checkLayout(layout: CardLayout, name = 'layout'): string[] {
  const out: string[] = []
  if (!finite(layout.w) || !finite(layout.h) || layout.w <= 0 || layout.h <= 0) return [`${name}: size must be positive numbers`]
  const inside = (p: Point) => finite(p.x) && finite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= layout.w && p.y <= layout.h
  for (const [k, z] of Object.entries(layout.zones)) {
    const at = `${name}.zones.${k}`
    if (k === '') out.push(`${name}: a zone has no name`)
    if (![z.x, z.y, z.w, z.h].every(finite)) out.push(`${at}: x, y, w, h must be numbers`)
    else if (z.w <= 0 || z.h <= 0) out.push(`${at}: empty`)
    else if (!inside(z) || !inside({ x: z.x + z.w, y: z.y + z.h })) out.push(`${at}: outside the card`)
    if (z.rotate !== undefined && !finite(z.rotate)) out.push(`${at}: rotate must be a number`)
    if (z.z !== undefined && !finite(z.z)) out.push(`${at}: z must be a number`)
  }
  for (const [k, a] of Object.entries(layout.anchors ?? {})) {
    const at = `${name}.anchors.${k}`
    if (k in layout.zones) out.push(`${at}: a zone has the same name`)
    if (!inside(a)) out.push(`${at}: outside the card`)
    if ((a.dx !== undefined && !finite(a.dx)) || (a.dy !== undefined && !finite(a.dy))) out.push(`${at}: dx, dy must be numbers`)
  }
  return out
}

/** Every layout of a game (one per card type) checked. */
export const checkLayouts = (layouts: Record<string, CardLayout>): string[] =>
  Object.entries(layouts).flatMap(([k, l]) => checkLayout(l, k))

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** `over` merged onto `base` (STCC mergeGeometry): objects by key, arrays of objects by index, the rest replaced. */
export function mergeLayout<T>(base: T, over: unknown): T {
  const merge = (b: unknown, o: unknown): unknown => {
    if (o === undefined) return b
    if (isObj(b) && isObj(o)) {
      const r: Record<string, unknown> = { ...b }
      for (const [k, v] of Object.entries(o)) r[k] = merge(b[k], v)
      return r
    }
    if (Array.isArray(b) && Array.isArray(o) && o.every(isObj))
      return Array.from({ length: Math.max(b.length, o.length) }, (_, i) => merge(b[i], o[i]))
    return o
  }
  return merge(base, over) as T
}

const pc = (n: number, of: number) => `${String((n / of) * 100)}%`

export interface Box { left: string; top: string; width: string; height: string; transform?: string }

/** A zone's box as CSS percentages of the card (absolute position inside it). */
export function zoneBox(layout: CardLayout, z: Zone): Box {
  return {
    left: pc(z.x, layout.w), top: pc(z.y, layout.h), width: pc(z.w, layout.w), height: pc(z.h, layout.h),
    ...(z.rotate ? { transform: `rotate(${String(z.rotate)}deg)` } : {}),
  }
}

/** The zones in drawing order. */
export const zonesInOrder = (layout: CardLayout): [string, Zone][] =>
  Object.entries(layout.zones)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e[1].z ?? 0) - (b.e[1].z ?? 0) || a.i - b.i)
    .map(({ e }) => e)

/** A named anchor, else a zone's centre (no step); undefined when neither. */
export function anchorOf(layout: CardLayout, name: string): Anchor | undefined {
  const a = layout.anchors?.[name]
  if (a) return a
  const z = layout.zones[name]
  return z && { x: z.x + z.w / 2, y: z.y + z.h / 2 }
}

export interface TokenAt { anchor: string }
export interface Placed<T> { token: T; x: number; y: number; left: string; top: string }

/** Tokens at their anchors: the n-th at one anchor sits n steps on. Unknown anchors are returned in `missing`. */
export function placeTokens<T extends TokenAt>(layout: CardLayout, tokens: readonly T[]): { placed: Placed<T>[]; missing: T[] } {
  const seen = new Map<string, number>()
  const placed: Placed<T>[] = []
  const missing: T[] = []
  for (const token of tokens) {
    const a = anchorOf(layout, token.anchor)
    if (!a) {
      missing.push(token)
      continue
    }
    const n = seen.get(token.anchor) ?? 0
    seen.set(token.anchor, n + 1)
    const x = a.x + n * (a.dx ?? 0)
    const y = a.y + n * (a.dy ?? 0)
    placed.push({ token, x, y, left: pc(x, layout.w), top: pc(y, layout.h) })
  }
  return { placed, missing }
}
