export type Thing = { type: string; id: string; space?: string }
export type Registry = { readonly things: Readonly<Record<string, Thing>>; readonly order: readonly string[] }
/** Legal-action list as a prompt gives it: per type, the legal ids, or id to 0/false (shown but barred) / 1/true. */
export type Actions = Record<string, readonly string[] | Record<string, number | boolean>>
export type Mark = 'legal' | 'barred' | 'none'
export type V = { dx: number; dy: number }

const key = (type: string, id: string) => `${type}:${id}`
export const emptyRegistry = (): Registry => ({ things: {}, order: [] })

/** Pure add or replace of a thing (space, piece, marker, stack...). Piece-like things name the space they sit in. */
export function define(r: Registry, t: Thing): Registry {
  const k = key(t.type, t.id)
  return { things: { ...r.things, [k]: t }, order: k in r.things ? r.order : [...r.order, k] }
}
export const remove = (r: Registry, type: string, id: string): Registry => {
  const k = key(type, id)
  if (!(k in r.things)) return r
  const things = { ...r.things }
  delete things[k]
  return { things, order: r.order.filter(o => o !== k) }
}
/** Move a thing to another space (undefined = off the board). */
export function moveTo(r: Registry, type: string, id: string, space: string | undefined): Registry {
  const t = r.things[key(type, id)]
  if (!t) throw new Error(`unknown thing ${type}:${id}`)
  return define(r, space === undefined ? { type: t.type, id: t.id } : { ...t, space })
}
export const get = (r: Registry, type: string, id: string): Thing | undefined => r.things[key(type, id)]
/** Things sitting in a space, in definition order (the stack, bottom first). */
export const inSpace = (r: Registry, space: string, type?: string): Thing[] =>
  r.order.flatMap(k => { const t = r.things[k]; return t && t.space === space && (type === undefined || t.type === type) ? [t] : [] })

/** Whether the legal-action list offers this thing. */
export function mark(actions: Actions, type: string, id: string): Mark {
  const a = Object.hasOwn(actions, type) ? actions[type] : undefined
  if (!a) return 'none'
  if (Array.isArray(a)) return (a as readonly string[]).includes(id) ? 'legal' : 'none'
  const v = Object.hasOwn(a, id) ? (a as Record<string, number | boolean>)[id] : undefined
  return v === undefined ? 'none' : v ? 'legal' : 'barred'
}
/** Every registered thing the action list marks, for the UI to give the `action` / `barred` class. */
export const highlighted = (r: Registry, actions: Actions): (Thing & { mark: Mark })[] =>
  r.order.flatMap(k => { const t = r.things[k]; if (!t) return []; const m = mark(actions, t.type, t.id); return m === 'none' ? [] : [{ ...t, mark: m }] })
/** Offered ids the registry does not know (a rule offered something the UI cannot show). */
export const unknownOffered = (r: Registry, actions: Actions): string[] =>
  Object.entries(actions).flatMap(([type, a]) => (Array.isArray(a) ? (a as readonly string[]) : Object.keys(a)).filter(id => !(key(type, id) in r.things)).map(id => key(type, id)))

export type StackOpts = {
  collapsed?: V
  /** Expanded: step `major` along a row of `wrap` pieces, `minor` between rows. */
  major?: V
  minor?: V
  wrap?: number
  /** At or under this many pieces the stack is always expanded. */
  threshold?: number
  expanded?: boolean
  /** Clamp so each piece (size `size`) stays inside bounds [x, y, w, h], the stack anchored at `anchor`. */
  bounds?: readonly [number, number, number, number]
  anchor?: readonly [number, number]
  size?: readonly [number, number]
}
/** Offsets from the anchor for n pieces sharing a space. */
export function stackLayout(n: number, o: StackOpts = {}): V[] {
  const open = o.expanded || n <= (o.threshold ?? 1)
  const c = o.collapsed ?? { dx: 2, dy: -2 }
  const M = o.major ?? { dx: 1, dy: 0 }
  const m = o.minor ?? { dx: 0, dy: 1 }
  const w = o.wrap && o.wrap > 0 ? o.wrap : Math.max(n, 1)
  const out: V[] = Array.from({ length: n }, (_, i) => {
    if (!open) return { dx: c.dx * i, dy: c.dy * i }
    const a = i % w
    const b = Math.floor(i / w)
    return { dx: M.dx * a + m.dx * b, dy: M.dy * a + m.dy * b }
  })
  if (!o.bounds || !n) return out
  const [bx, by, bw, bh] = o.bounds
  const [ax, ay] = o.anchor ?? [0, 0]
  const [sw, sh] = o.size ?? [0, 0]
  const fix = (lo: number, hi: number, b0: number, b1: number) => (hi - lo > b1 - b0 || lo < b0 ? b0 - lo : hi > b1 ? b1 - hi : 0)
  const xs = out.map(p => ax + p.dx)
  const ys = out.map(p => ay + p.dy)
  const sx = fix(Math.min(...xs), Math.max(...xs) + sw, bx, bx + bw)
  const sy = fix(Math.min(...ys), Math.max(...ys) + sh, by, by + bh)
  return out.map(p => ({ dx: p.dx + sx, dy: p.dy + sy }))
}
