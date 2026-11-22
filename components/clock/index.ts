export type Space = number | string
export interface Threshold<D = unknown> {
  readonly id: string
  readonly at: Space
  readonly on: 'land' | 'pass' | 'landOrPass'
  readonly direction?: 'forward' | 'back' | 'either'
  readonly once?: boolean
  readonly kind: string
  readonly data?: D
}
export interface ClockSpec<D = unknown> {
  readonly spaces: number | readonly string[]
  readonly start: Space
  readonly direction?: 'up' | 'down'
  readonly ends?: 'stop' | 'wrap'
  readonly thresholds: readonly Threshold<D>[]
  readonly values?: Readonly<Record<string, readonly unknown[]>>
}
export interface ClockState { readonly value: number; readonly fired: readonly string[] }
export interface Crossing<D = unknown> { readonly threshold: Threshold<D>; readonly from: number; readonly to: number; readonly space: number; readonly how: 'land' | 'pass'; readonly way?: 'forward' | 'back' }
export interface ClockOccurrence<D = unknown> { kind: string; keys: { target: string }; amount: number; space?: number; how?: 'land' | 'pass'; way?: 'forward' | 'back'; data?: D }
export interface StepResult<D = unknown> { readonly state: ClockState; readonly crossings: readonly Crossing<D>[]; readonly overrun?: number }

const size = (spec: ClockSpec) => typeof spec.spaces === 'number' ? spec.spaces : spec.spaces.length
export function indexOf(spec: ClockSpec, x: Space): number {
  if (typeof x === 'number') return Number.isInteger(x) && x >= 0 && x < size(spec) ? x : -1
  return typeof spec.spaces === 'number' ? -1 : spec.spaces.indexOf(x)
}
const endOf = (spec: ClockSpec) => spec.direction === 'down' ? 0 : size(spec) - 1
const sign = (spec: ClockSpec) => spec.direction === 'down' ? -1 : 1

export function newClock(spec: ClockSpec): ClockState {
  return { value: indexOf(spec, spec.start), fired: [] }
}
export function spaceOf(spec: ClockSpec, state: ClockState): Space {
  return typeof spec.spaces === 'number' ? state.value : spec.spaces[state.value] as string
}
export function valueAt<T = number>(spec: ClockSpec, state: ClockState, key: string): T | undefined {
  return spec.values?.[key]?.[state.value] as T | undefined
}
export function step<D>(spec: ClockSpec<D>, state: ClockState, by: number): StepResult<D> {
  if (!Number.isFinite(by)) throw new Error(`clock: a step must be a finite number, not ${String(by)}`)
  const n = size(spec), d = Math.sign(by) * sign(spec), wrap = spec.ends === 'wrap', path: number[] = []
  const asked = Math.ceil(Math.abs(by)), walk = wrap && asked > 1000 * n ? 1000 * n + asked % n : asked
  let v = state.value
  for (let i = 0; i < walk; i++) {
    let next = v + d
    if (wrap) next = (next + n) % n
    else if (next < 0 || next >= n) break
    path.push(v = next)
  }
  const fired = [...state.fired], crossings: Crossing<D>[] = []
  const way = by > 0 ? 'forward' : 'back'
  path.forEach((space, i) => {
    const how = i === path.length - 1 ? 'land' : 'pass'
    for (const t of spec.thresholds) {
      if (indexOf(spec, t.at) !== space) continue
      if (t.on !== 'landOrPass' && t.on !== how) continue
      const dir = t.direction ?? 'forward'
      if (dir !== 'either' && dir !== way) continue
      if (t.once && fired.includes(t.id)) continue
      if (t.once) fired.push(t.id)
      crossings.push({ threshold: t, from: state.value, to: v, space, how, way })
    }
  })
  const overrun = wrap ? 0 : asked - path.length
  return { state: { value: v, fired }, crossings, ...(overrun > 0 ? { overrun } : {}) }
}
export function setTo(spec: ClockSpec, state: ClockState, space: Space): ClockState {
  const value = indexOf(spec, space)
  if (value < 0) throw new Error(`clock: ${space} is not a space`)
  return { value, fired: state.fired }
}
export function stepsTo(spec: ClockSpec, state: ClockState, space: Space, way: 'forward' | 'back' = 'forward'): number {
  const i = indexOf(spec, space), n = size(spec)
  if (i < 0) throw new Error(`clock: ${space} is not a space`)
  const by = (i - state.value) * sign(spec)
  return spec.ends === 'wrap' ? ((by % n) + n) % n - (way === 'back' && by % n ? n : 0) : by || 0
}
export function left(spec: ClockSpec, state: ClockState): number {
  return Math.abs(endOf(spec) - state.value)
}
export function ended(spec: ClockSpec, state: ClockState): boolean {
  return spec.ends !== 'wrap' && state.value === endOf(spec)
}
export function onSpace(spec: ClockSpec, state: ClockState, space: Space): boolean {
  return state.value >= 0 && state.value === indexOf(spec, space)
}
export function reached(spec: ClockSpec, state: ClockState, space: Space): boolean {
  const i = indexOf(spec, space)
  return spec.ends !== 'wrap' && i >= 0 && state.value >= 0 && state.value < size(spec) && (state.value - i) * sign(spec) >= 0
}
export function occurrences<D = unknown>(crossings: readonly Crossing<D>[], prefix = 'clock.', detail = false): ClockOccurrence<D>[] {
  return crossings.map((c) => ({ kind: prefix + c.threshold.kind, keys: { target: c.threshold.id }, amount: 1, ...(detail ? { space: c.space, how: c.how, ...(c.way ? { way: c.way } : {}), ...(c.threshold.data === undefined ? {} : { data: c.threshold.data }) } : {}) }))
}
export function checkClock(spec: ClockSpec): string[] {
  if (!spec || typeof spec !== 'object') return ['spec is not an object']
  const p: string[] = []
  const s: number | readonly string[] = spec.spaces, ts: readonly Threshold[] = spec.thresholds
  if (typeof s !== 'number' && Array.isArray(s)) s.forEach((id, i) => { if (typeof id !== 'string' || !id) p.push(`space ${i} has no id`); else if (s.indexOf(id) !== i) p.push(`space id ${id} repeats`) })
  else if (!(typeof s === 'number' && Number.isInteger(s) && s > 0)) return ['spaces must be a whole number above 0 or a list of ids']
  for (const k of Object.keys(spec)) if (!['spaces', 'start', 'direction', 'ends', 'thresholds', 'values'].includes(k)) p.push(`unknown key ${k}`)
  if (indexOf(spec, spec.start) < 0) p.push(`start ${spec.start} is not a space`)
  if (spec.direction !== undefined && spec.direction !== 'up' && spec.direction !== 'down') p.push(`direction ${String(spec.direction)} is not up or down`)
  if (spec.ends !== undefined && spec.ends !== 'stop' && spec.ends !== 'wrap') p.push(`ends ${String(spec.ends)} is not stop or wrap`)
  if (!Array.isArray(ts)) p.push('thresholds is not a list')
  else {
    const seen = new Set<string>()
    for (const [i, t] of spec.thresholds.entries()) {
      if (!t || typeof t !== 'object') { p.push(`threshold ${i} is not an object`); continue }
      const id: unknown = t.id, once: unknown = t.once, kind: unknown = t.kind, odd = !!id && typeof id !== 'string'
      const name = odd && typeof id !== 'number' ? i : t.id
      if (odd) { p.push(`threshold ${name}: id is not text`); if (name === i) continue }
      for (const k of Object.keys(t)) if (!['id', 'at', 'on', 'direction', 'once', 'kind', 'data'].includes(k)) p.push(`threshold ${name}: unknown key ${k}`)
      if (once !== undefined && typeof once !== 'boolean') p.push(`threshold ${name}: once is not true or false`)
      if (kind && typeof kind !== 'string') p.push(`threshold ${name}: kind is not text`)
      if (indexOf(spec, t.at) < 0) p.push(`threshold ${t.id}: at ${t.at} is not a space`)
      if (!['land', 'pass', 'landOrPass'].includes(t.on)) p.push(`threshold ${t.id}: on ${t.on} is not land, pass or landOrPass`)
      if (t.direction !== undefined && !['forward', 'back', 'either'].includes(t.direction)) p.push(`threshold ${t.id}: direction ${t.direction} is not forward, back or either`)
      if (!t.kind) p.push(`threshold ${t.id}: kind is empty`)
      if (!t.id) p.push('a threshold has no id')
      else if (seen.has(t.id)) p.push(`threshold id ${t.id} repeats`)
      seen.add(t.id)
    }
  }
  const vals: unknown = spec.values
  if (vals !== undefined && (!vals || typeof vals !== 'object' || Array.isArray(vals))) p.push('values is not an object of lists')
  else for (const [k, row] of Object.entries(spec.values ?? {}) as [string, unknown][]) if (!Array.isArray(row) || row.length !== size(spec)) p.push(`values ${k} has ${Array.isArray(row) ? row.length : 0} entries, not ${size(spec)}`)
  return p
}
