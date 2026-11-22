import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import * as frozen from './clock.frozen.ts'
import * as clock from './index.ts'
import { checkClock, ended, left, newClock, occurrences, onSpace, reached, setTo, spaceOf, step, stepsTo, valueAt, type ClockSpec, type ClockState, type Threshold } from './index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const readme = readFileSync(join(here, 'README.md'), 'utf8')
const HEADINGS = ['Use it in 10 lines', 'Recipe: a dry run', 'Recipe: a lose space that is not the last']
const block = (heading: string, nth = 0) => [...(readme.split(/^## /m).find((p) => p.startsWith(heading + '\n') || p.startsWith(heading + '\r')) ?? '').matchAll(/```ts\r?\n([\s\S]*?)```/g)][nth]?.[1] ?? ''
const run = (heading: string, nth = 0, would: unknown = undefined): unknown => {
  const code = block(heading, nth)
  expect(code, heading + ' has a ts block').not.toBe('')
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    (new Function('require', 'exports', 'would', ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText) as (r: () => unknown, e: object, w: unknown) => void)(() => clock, {}, would)
    return log.mock.calls.at(-1)
  } finally { log.mockRestore() }
}

const ids = (cs: readonly { threshold: { id: string }; how: string }[]) => cs.map((c) => `${c.threshold.id}:${c.how}`)

describe('clock', () => {
  it('a 15-space countdown is lost when it runs out', () => {
    const spec: ClockSpec = { spaces: 15, start: 14, direction: 'down', ends: 'stop', thresholds: [{ id: 'out', at: 0, on: 'land', kind: 'lose' }] }
    let s = newClock(spec)
    expect(s).toEqual({ value: 14, fired: [] })
    expect(left(spec, s)).toBe(14)
    for (let i = 0; i < 13; i++) { const r = step(spec, s, 1); expect(r.crossings).toEqual([]); s = r.state }
    expect(ended(spec, s)).toBe(false)
    const r = step(spec, s, 1)
    expect(ids(r.crossings)).toEqual(['out:land'])
    expect(r.crossings[0]).toMatchObject({ from: 1, to: 0, space: 0 })
    expect(ended(spec, r.state)).toBe(true)
    expect(left(spec, r.state)).toBe(0)
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state)
  })
  it('reads a limit from the marker row', () => {
    const spec: ClockSpec = { spaces: ['a', 'b', 'c', 'd'], start: 'a', thresholds: [], values: { limit: [1, 1, 2, 3] } }
    let s = newClock(spec)
    expect(valueAt(spec, s, 'limit')).toBe(1)
    s = step(spec, s, 2).state
    expect(spaceOf(spec, s)).toBe('c')
    expect(valueAt(spec, s, 'limit')).toBe(2)
    expect(valueAt(spec, s, 'nope')).toBeUndefined()
  })
  it('an advance of 2 passes one threshold and lands on another, in order', () => {
    const spec: ClockSpec = { spaces: 6, start: 0, thresholds: [
      { id: 'land2', at: 2, on: 'land', kind: 'reward' },
      { id: 'pass1', at: 1, on: 'pass', kind: 'trigger' },
    ] }
    expect(ids(step(spec, newClock(spec), 2).crossings)).toEqual(['pass1:pass', 'land2:land'])
  })
  it('a step back re-crosses: fires for either, not for forward', () => {
    const spec: ClockSpec = { spaces: 6, start: 0, thresholds: [
      { id: 'fwd', at: 2, on: 'landOrPass', kind: 'trigger' },
      { id: 'any', at: 2, on: 'landOrPass', direction: 'either', kind: 'trigger' },
      { id: 'back', at: 2, on: 'landOrPass', direction: 'back', kind: 'trigger' },
    ] }
    const a = step(spec, newClock(spec), 3)
    expect(ids(a.crossings)).toEqual(['fwd:pass', 'any:pass'])
    const b = step(spec, a.state, -3)
    expect(ids(b.crossings)).toEqual(['any:pass', 'back:pass'])
    expect(b.state.value).toBe(0)
  })
  it('a once threshold does not fire twice', () => {
    const spec: ClockSpec = { spaces: 6, start: 0, thresholds: [{ id: 'one', at: 2, on: 'landOrPass', direction: 'either', once: true, kind: 'reward' }] }
    const a = step(spec, newClock(spec), 3)
    expect(ids(a.crossings)).toEqual(['one:pass'])
    expect(a.state.fired).toEqual(['one'])
    expect(step(spec, a.state, -3).crossings).toEqual([])
    expect(step(spec, step(spec, a.state, -3).state, 2).crossings).toEqual([])
  })
  it('rewards on landing against on passing, both directions', () => {
    const spec: ClockSpec = { spaces: 6, start: 0, thresholds: [
      { id: 'L', at: 2, on: 'land', direction: 'either', kind: 'reward' },
      { id: 'P', at: 2, on: 'pass', direction: 'either', kind: 'reward' },
    ] }
    expect(ids(step(spec, newClock(spec), 2).crossings)).toEqual(['L:land'])
    expect(ids(step(spec, newClock(spec), 3).crossings)).toEqual(['P:pass'])
    const at4 = setTo(spec, newClock(spec), 4)
    expect(ids(step(spec, at4, -2).crossings)).toEqual(['L:land'])
    expect(ids(step(spec, at4, -3).crossings)).toEqual(['P:pass'])
  })
  it('a step of 0 fires nothing', () => {
    const spec: ClockSpec = { spaces: 6, start: 2, thresholds: [{ id: 'x', at: 2, on: 'landOrPass', direction: 'either', kind: 'trigger' }] }
    const r = step(spec, newClock(spec), 0)
    expect(r.crossings).toEqual([])
    expect(r.state.value).toBe(2)
  })
  it('a step past the end with stop: the value stops, the end threshold fires once', () => {
    const spec: ClockSpec = { spaces: 5, start: 2, ends: 'stop', thresholds: [{ id: 'end', at: 4, on: 'landOrPass', kind: 'lose' }] }
    const r = step(spec, newClock(spec), 7)
    expect(r.state.value).toBe(4)
    expect(ids(r.crossings)).toEqual(['end:land'])
    expect(r.crossings[0]).toMatchObject({ from: 2, to: 4 })
    const again = step(spec, r.state, 3)
    expect(again.crossings).toEqual([])
    expect(again.state.value).toBe(4)
    expect(step(spec, newClock(spec), -9).state.value).toBe(0)
  })
  it('a step past the end with wrap goes round and fires each lap', () => {
    const spec: ClockSpec = { spaces: 4, start: 2, ends: 'wrap', thresholds: [{ id: 'z', at: 0, on: 'landOrPass', kind: 'trigger' }] }
    const r = step(spec, newClock(spec), 3)
    expect(r.state.value).toBe(1)
    expect(ids(r.crossings)).toEqual(['z:pass'])
    expect(ids(step(spec, newClock(spec), 6).crossings)).toEqual(['z:pass', 'z:land'])
    expect(step(spec, newClock(spec), -3).state.value).toBe(3)
    expect(ended(spec, r.state)).toBe(false)
    expect(left(spec, r.state)).toBe(2)
  })
  it('setTo moves the marker and fires nothing', () => {
    const spec: ClockSpec = { spaces: ['a', 'b', 'c'], start: 'a', thresholds: [{ id: 'c', at: 'c', on: 'land', direction: 'either', kind: 'lose' }] }
    const s = setTo(spec, newClock(spec), 'c')
    expect(s).toEqual({ value: 2, fired: [] })
    expect(ended(spec, s)).toBe(true)
    expect(() => setTo(spec, s, 'zz')).toThrow()
  })
  it('two thresholds on one space fire as listed', () => {
    const spec: ClockSpec = { spaces: 5, start: 0, thresholds: [
      { id: 'second', at: 3, on: 'land', kind: 'limit', data: { n: 2 } },
      { id: 'first', at: 3, on: 'land', kind: 'reward' },
    ] }
    const r = step(spec, newClock(spec), 3)
    expect(ids(r.crossings)).toEqual(['second:land', 'first:land'])
    expect(r.crossings[0]?.threshold.data).toEqual({ n: 2 })
  })
  it('step and setTo leave the input state unchanged', () => {
    const spec: ClockSpec = { spaces: 5, start: 0, thresholds: [{ id: 'o', at: 1, on: 'landOrPass', once: true, kind: 'reward' }] }
    const s = Object.freeze({ value: 0, fired: Object.freeze([] as string[]) })
    const r = step(spec, s, 3)
    expect(r.state).toEqual({ value: 3, fired: ['o'] })
    expect(s).toEqual({ value: 0, fired: [] })
    expect(setTo(spec, s, 4).value).toBe(4)
    expect(s).toEqual({ value: 0, fired: [] })
  })
  it('turns crossings into occurrence inputs', () => {
    const spec: ClockSpec = { spaces: 5, start: 0, thresholds: [{ id: 't', at: 1, on: 'pass', kind: 'reward' }] }
    expect(occurrences(step(spec, newClock(spec), 2).crossings)).toEqual([{ kind: 'clock.reward', keys: { target: 't' }, amount: 1 }])
  })
  it('K581 a lose space in the middle of the row: landing loses, passing over it does not', () => {
    const spec: ClockSpec = { spaces: 8, start: 0, thresholds: [{ id: 'gone', at: 5, on: 'land', kind: 'lose' }] }
    const lost = (r: ReturnType<typeof step>) => r.crossings.some((c) => c.threshold.kind === 'lose')
    const at3 = step(spec, newClock(spec), 3)
    expect(lost(at3)).toBe(false)
    expect(onSpace(spec, at3.state, 5)).toBe(false)
    const over = step(spec, at3.state, 4)
    expect(over.state.value).toBe(7)
    expect(lost(over)).toBe(false)
    expect(onSpace(spec, over.state, 5)).toBe(false)
    expect(ended(spec, over.state)).toBe(true)
    const on = step(spec, at3.state, 2)
    expect(ids(on.crossings)).toEqual(['gone:land'])
    expect(lost(on)).toBe(true)
    expect(ended(spec, on.state)).toBe(false)
    expect(onSpace(spec, on.state, 5)).toBe(true)
    expect(onSpace(spec, setTo(spec, newClock(spec), 5), 5)).toBe(true)
    expect(onSpace(spec, on.state, 9)).toBe(false)
  })
  it('K581 a lose space in the middle of the row, pass variant: passing over it loses too', () => {
    const spec: ClockSpec = { spaces: ['a', 'b', 'c', 'd', 'e'], start: 'e', direction: 'down', thresholds: [{ id: 'gone', at: 'c', on: 'landOrPass', kind: 'lose' }] }
    expect(ids(step(spec, newClock(spec), 3).crossings)).toEqual(['gone:pass'])
    expect(ids(step(spec, newClock(spec), 2).crossings)).toEqual(['gone:land'])
    expect(step(spec, newClock(spec), 1).crossings).toEqual([])
    expect(['e', 'd', 'c', 'b', 'a'].map((x) => reached(spec, setTo(spec, newClock(spec), x), 'c'))).toEqual([false, false, true, true, true])
    const up: ClockSpec = { spaces: 8, start: 0, thresholds: [] }
    expect([4, 5, 6].map((x) => reached(up, setTo(up, newClock(up), x), 5))).toEqual([false, true, true])
    expect(reached(up, setTo(up, newClock(up), 7), 9)).toBe(false)
    expect(reached({ ...up, ends: 'wrap' }, setTo(up, newClock(up), 6), 5)).toBe(false)
  })
  it('K581 a crossing says which way the marker travelled', () => {
    const spec: ClockSpec = { spaces: 6, start: 0, direction: 'down', thresholds: [{ id: 'any', at: 2, on: 'landOrPass', direction: 'either', kind: 'trigger' }] }
    const back = step(spec, newClock(spec), -3)
    expect(back.crossings.map((c) => c.way)).toEqual(['back'])
    expect(step(spec, back.state, 1).crossings.map((c) => c.way)).toEqual(['forward'])
  })
  it('K581 detailed occurrences carry the threshold data, its space, how and the way; the default is as before', () => {
    const spec: ClockSpec<{ gain: number }> = { spaces: ['a', 'b', 'c', 'd'], start: 'a', thresholds: [
      { id: 'r', at: 'b', on: 'pass', kind: 'reward', data: { gain: 2 } },
      { id: 'bare', at: 'c', on: 'land', direction: 'either', kind: 'trigger' },
    ] }
    const r = step(spec, newClock(spec), 2)
    expect(occurrences(r.crossings, 'clock.', true)).toEqual([
      { kind: 'clock.reward', keys: { target: 'r' }, amount: 1, space: 1, how: 'pass', way: 'forward', data: { gain: 2 } },
      { kind: 'clock.trigger', keys: { target: 'bare' }, amount: 1, space: 2, how: 'land', way: 'forward' },
    ])
    expect(Object.keys(occurrences(r.crossings, 'clock.', true)[1] ?? {})).toEqual(['kind', 'keys', 'amount', 'space', 'how', 'way'])
    expect(occurrences(r.crossings, 'clock.', true)[0]?.data?.gain).toBe(2)
    expect(occurrences(step(spec, setTo(spec, r.state, 'd'), -1).crossings, 't.', true)).toEqual([{ kind: 't.trigger', keys: { target: 'bare' }, amount: 1, space: 2, how: 'land', way: 'back' }])
    expect(occurrences(r.crossings).map((o) => Object.keys(o))).toEqual([['kind', 'keys', 'amount'], ['kind', 'keys', 'amount']])
    const bare = spec.thresholds[1]
    expect(bare && occurrences([{ threshold: bare, from: 0, to: 2, space: 2, how: 'land' }], 'clock.', true)).toEqual([{ kind: 'clock.trigger', keys: { target: 'bare' }, amount: 1, space: 2, how: 'land' }])
  })
  it('checkClock reports bad data as problems', () => {
    expect(checkClock({ spaces: 5, start: 0, thresholds: [] })).toEqual([])
    const bad = checkClock({
      spaces: ['a', 'a'], start: 'q', direction: 'sideways', ends: 'bounce',
      thresholds: [{ id: 'x', at: 'zz', on: 'hop', direction: 'up', kind: '' }, { id: 'x', at: 0, on: 'land', kind: 'k' }],
      values: { limit: [1] },
    } as unknown as ClockSpec)
    expect(bad).toEqual([
      'space id a repeats', 'start q is not a space', 'direction sideways is not up or down', 'ends bounce is not stop or wrap',
      'threshold x: at zz is not a space', 'threshold x: on hop is not land, pass or landOrPass', 'threshold x: direction up is not forward, back or either', 'threshold x: kind is empty',
      'threshold id x repeats', 'values limit has 1 entries, not 2',
    ])
    expect(checkClock({ spaces: 0, start: 0, thresholds: [] })).toEqual(['spaces must be a whole number above 0 or a list of ids'])
    expect(checkClock(null as unknown as ClockSpec)).toEqual(['spec is not an object'])
    expect(checkClock({ spaces: 3, start: 0, thresholds: [null, 5, { id: 'k', at: 1, on: 'land', kind: 'x' }] } as unknown as ClockSpec)).toEqual(['threshold 0 is not an object', 'threshold 1 is not an object'])
  })
  it('K588 a dry run to a target space is right on a down clock (the README clock)', () => {
    const spec: ClockSpec = { spaces: 15, start: 14, direction: 'down', ends: 'stop', thresholds: [{ id: 'out', at: 0, on: 'land', kind: 'lose' }, { id: 'half', at: 7, on: 'landOrPass', once: true, kind: 'trigger' }] }
    const s = setTo(spec, newClock(spec), 3)
    expect(stepsTo(spec, s, 0)).toBe(3)
    const dry = step(spec, s, stepsTo(spec, s, 0))
    expect([dry.state.value, ids(dry.crossings), s.value]).toEqual([0, ['out:land'], 3])
    const top = newClock(spec)
    expect(ids(step(spec, top, stepsTo(spec, top, 6)).crossings)).toEqual(['half:pass'])
    expect(step(spec, setTo(spec, top, 10), stepsTo(spec, setTo(spec, top, 10), 7)).state.value).toBe(7)
    expect(run('Recipe: a dry run')).toEqual([3, 0, ['out'], 3])
  })
  it('K588 stepsTo is the distance to a space: with the direction positive, against it negative, forward round a wrap', () => {
    const up: ClockSpec = { spaces: ['a', 'b', 'c', 'd', 'e', 'f'], start: 'b', thresholds: [] }
    expect([stepsTo(up, newClock(up), 'e'), stepsTo(up, newClock(up), 'a'), stepsTo(up, newClock(up), 'b'), stepsTo(up, newClock(up), 4)]).toEqual([3, -1, 0, 3])
    expect(left(up, newClock(up))).toBe(4)
    const down: ClockSpec = { ...up, direction: 'down', start: 'e' }
    expect([stepsTo(down, newClock(down), 'b'), stepsTo(down, newClock(down), 'f')]).toEqual([3, -1])
    expect(Object.is(stepsTo(down, newClock(down), 'e'), 0)).toBe(true)
    const loop: ClockSpec = { spaces: 8, start: 7, ends: 'wrap', thresholds: [] }
    expect([stepsTo(loop, newClock(loop), 2), stepsTo(loop, newClock(loop), 7), stepsTo({ ...loop, direction: 'down' }, newClock(loop), 2)]).toEqual([3, 0, 5])
    expect(step(loop, newClock(loop), stepsTo(loop, newClock(loop), 2)).state.value).toBe(2)
    expect(() => stepsTo(up, newClock(up), 'zz')).toThrow('clock: zz is not a space')
    expect(() => stepsTo(loop, newClock(loop), 8)).toThrow('clock: 8 is not a space')
  })
  it('K588 lose-space recipe: a step back onto a land lose space loses on the step and in the state check alike', () => {
    expect(run('Recipe: a lose space that is not the last')).toEqual(['lost', true, 'lost'])
    const spec = (direction?: 'either'): ClockSpec => ({ spaces: 8, start: 7, thresholds: [{ id: 'gone', at: 5, on: 'land', ...(direction ? { direction } : {}), kind: 'lose' }] })
    const quiet = step(spec(), newClock(spec()), -2)
    expect([ids(quiet.crossings), onSpace(spec(), quiet.state, 5)]).toEqual([[], true])
    const r = step(spec('either'), newClock(spec('either')), -2)
    expect([ids(r.crossings), r.crossings[0]?.way, onSpace(spec('either'), r.state, 5)]).toEqual([['gone:land'], 'back', true])
    expect(ids(step(spec('either'), newClock(spec('either')), -3).crossings)).toEqual([])
  })
  it('K588 reach-or-pass lose space: a forward threshold and reached agree on a move against the direction', () => {
    const spec: ClockSpec = { spaces: 8, start: 3, thresholds: [{ id: 'gone', at: 5, on: 'landOrPass', kind: 'lose' }] }
    const over = step(spec, newClock(spec), 4)
    expect([ids(over.crossings), reached(spec, over.state, 5)]).toEqual([['gone:pass'], true])
    const back = step(spec, over.state, -3)
    expect([back.state.value, ids(back.crossings), reached(spec, back.state, 5)]).toEqual([4, [], false])
    const stay = step(spec, over.state, -2)
    expect([ids(stay.crossings), reached(spec, over.state, 5), reached(spec, stay.state, 5)]).toEqual([[], true, true])
  })
  it('K588 reached agrees with onSpace on a state outside the row', () => {
    const down: ClockSpec = { spaces: 8, start: 9, direction: 'down', thresholds: [] }
    expect(checkClock(down)).toEqual(['start 9 is not a space'])
    expect(newClock(down).value).toBe(-1)
    expect([reached(down, newClock(down), 5), onSpace(down, newClock(down), 5)]).toEqual([false, false])
    const up: ClockSpec = { spaces: 8, start: 0, thresholds: [] }
    expect([reached(up, { value: 20, fired: [] }, 5), onSpace(up, { value: 20, fired: [] }, 5)]).toEqual([false, false])
    expect([reached(up, { value: -1, fired: [] }, 5), reached(down, { value: 20, fired: [] }, 5)]).toEqual([false, false])
    expect([reached(up, { value: 7, fired: [] }, 5), reached(down, { value: 0, fired: [] }, 5)]).toEqual([true, true])
  })
  it('K588 README rule 9: the detail fields are for the caller that holds the crossings, not for a trigger', () => {
    const rule = readme.split(/\r?\n/).find((l) => l.startsWith('9. ')) ?? ''
    expect(rule).toMatch(/the caller that holds the crossings/)
    expect(rule).toMatch(/A trigger or window sees only what the engine passes on/)
    expect(readme).not.toMatch(/reader \((a )?trigger/)
    expect(readme).not.toMatch(/a reader inside a trigger or window reads them/)
  })
  it('K588 a step that does not fit on a stop row says how many steps were left over', () => {
    const spec: ClockSpec = { spaces: 15, start: 14, ends: 'stop', thresholds: [{ id: 'last', at: 14, on: 'land', kind: 'x' }] }
    const full = step(spec, newClock(spec), 1)
    expect([full.state.value, full.crossings.length, full.overrun, ended(spec, full.state)]).toEqual([14, 0, 1, true])
    const part = step(spec, setTo(spec, newClock(spec), 13), 3)
    expect([part.state.value, ids(part.crossings), part.overrun]).toEqual([14, ['last:land'], 2])
    expect(step(spec, setTo(spec, newClock(spec), 1), -4).overrun).toBe(3)
    const fits = step(spec, setTo(spec, newClock(spec), 13), 1)
    expect('overrun' in fits).toBe(false)
    expect(Object.keys(fits)).toEqual(['state', 'crossings'])
    expect('overrun' in step(spec, newClock(spec), 0)).toBe(false)
    const down: ClockSpec = { spaces: 4, start: 1, direction: 'down', thresholds: [] }
    expect(step(down, newClock(down), 3).overrun).toBe(2)
    expect(step({ ...down, ends: 'wrap' }, newClock(down), 9).overrun).toBeUndefined()
  })
  it('K640 a fractional step counts as the next whole step, in the move and in overrun', () => {
    const spec: ClockSpec = { spaces: 6, start: 2, thresholds: [3, 4, 5].map((at) => ({ id: 't' + at, at, on: 'landOrPass' as const, direction: 'either' as const, kind: 'x' })) }
    const half = step(spec, newClock(spec), 0.5)
    expect([half.state.value, ids(half.crossings), 'overrun' in half]).toEqual([3, ['t3:land'], false])
    expect(step(spec, newClock(spec), -0.5).state.value).toBe(1)
    const long = step(spec, newClock(spec), 3.2)
    expect([long.state.value, ids(long.crossings), long.overrun]).toEqual([5, ['t3:pass', 't4:pass', 't5:land'], 1])
    expect(step(spec, setTo(spec, newClock(spec), 5), 0.5).overrun).toBe(1)
    expect(step(spec, setTo(spec, newClock(spec), 4), 2.5).overrun).toBe(2)
    expect(step(spec, setTo(spec, newClock(spec), 1), -1.5).overrun).toBe(1)
    expect(readme.split(/\r?\n/).find((l) => l.startsWith('4. '))).toMatch(/A fractional amount counts as the next whole step \(0\.5 moves one space, 2\.5 three, and `overrun` counts the same way\)/)
  })
  it('K640 onSpace: true on space 0, false for a state off the row whatever the space', () => {
    const spec: ClockSpec = { spaces: 8, start: 0, thresholds: [] }
    expect(onSpace(spec, newClock(spec), 0)).toBe(true)
    expect(onSpace(spec, { value: 0, fired: [] }, 0)).toBe(true)
    expect(onSpace(spec, { value: -1, fired: [] }, 9)).toBe(false)
    expect(onSpace(spec, { value: -1, fired: [] }, 'zz')).toBe(false)
    expect(onSpace({ ...spec, start: 9 }, newClock({ ...spec, start: 9 }), -1)).toBe(false)
    expect(onSpace(spec, { value: 1.5, fired: [] }, 1)).toBe(false)
  })
  it('K640 README recipe engine-core and track runs: the crossings go to would, the checkpoint check loses on the end space', () => {
    const would = vi.fn()
    expect(run('Recipe: engine-core and track', 0, would)).toEqual([true, 'lost'])
    expect(would.mock.calls).toEqual([[{ s: { clock: { value: 3, fired: [] }, over: 'lost' } }, [{ kind: 'clock.lose', keys: { target: 'out' }, amount: 1 }]]])
  })
  it('K640 README lose-space recipe: the checkpoint check loses a loaded save with onSpace; the reach-or-pass block runs', () => {
    expect(run('Recipe: a lose space that is not the last')).toEqual(['lost', true, 'lost'])
    expect(run('Recipe: a lose space that is not the last', 1)).toEqual([['lose:pass'], true, 0, false, true])
    expect(block('Recipe: a lose space that is not the last')).toMatch(/onSpace\(spec, ctx\.s\.clock, loseSpace\)/)
    expect(block('Recipe: a lose space that is not the last', 1)).toMatch(/on: 'landOrPass', kind: 'lose'[\s\S]*reached\(spec, clock, loseSpace\)/)
    expect(readme).toMatch(/Reaching or passing loses: `on: 'landOrPass'` and no `direction` \(so `forward`\) in the threshold, and `reached\(spec, ctx\.s\.clock, loseSpace\)` in the check:\r?\n\r?\n```ts/)
  })
  it('K640 every clock call the README names is an export, and only the Track line is left as text', () => {
    const names = [...new Set([...readme.matchAll(/(?<![.\w])([A-Za-z]\w*)\((?:spec|crossings|r\.crossings)\b/g)].map((m) => m[1] ?? ''))]
    expect(names.length).toBeGreaterThan(11)
    expect(names.filter((n) => typeof (clock as Record<string, unknown>)[n] !== 'function')).toEqual([])
    expect([...readme.matchAll(/```text\r?\n([\s\S]*?)```/g)].map((m) => (m[1] ?? '').trim().split(/\r?\n/).length)).toEqual([1])
    expect(/```text\r?\n<Track /.test(readme)).toBe(true)
  })
  it('K640 README rule 10: overrun, not ended, is the sign of a marker that must move and cannot', () => {
    const rule = readme.split(/\r?\n/).find((l) => l.startsWith('10. ')) ?? ''
    expect(rule).toMatch(/read `overrun` on the result of that `step`/)
    expect(rule).toMatch(/Never `ended` for it: `ended` is true as soon as the marker stands on the last space/)
    const spec: ClockSpec = { spaces: 8, start: 6, thresholds: [] }
    const on = step(spec, newClock(spec), 1)
    expect([ended(spec, on.state), on.overrun]).toEqual([true, undefined])
    const next = step(spec, on.state, 1)
    expect([next.state.value, next.crossings.length, next.overrun]).toEqual([7, 0, 1])
  })
  it('K640 README rule 11: stepsTo, not target - value, is the step to a space on a down clock', () => {
    const rule = readme.split(/\r?\n/).find((l) => l.startsWith('11. ')) ?? ''
    expect(rule).toMatch(/with `stepsTo\(spec, state, space\)`, never `target - value`: on a `down` clock that is the wrong way round/)
    const spec: ClockSpec = { spaces: 8, start: 6, direction: 'down', thresholds: [] }
    const s = newClock(spec), target = 2
    expect(step(spec, s, stepsTo(spec, s, target)).state.value).toBe(target)
    expect(step(spec, s, target - s.value).state.value).toBe(7)
  })
  it('K640 a huge step on a wrap row returns at once: same landing, once fires once, at most 1000 laps of crossings', () => {
    const spec: ClockSpec = { spaces: 12, start: 5, ends: 'wrap', thresholds: [{ id: 'lap', at: 0, on: 'landOrPass', kind: 'x' }, { id: 'one', at: 3, on: 'landOrPass', once: true, kind: 'y' }] }
    const t0 = Date.now()
    const r = step(spec, newClock(spec), 1e9)
    const back = step({ ...spec, thresholds: [{ id: 'lap', at: 0, on: 'landOrPass', direction: 'back', kind: 'x' }] }, newClock(spec), -1e9)
    expect(Date.now() - t0).toBeLessThan(1000)
    expect([r.state.value, r.state.fired, 'overrun' in r]).toEqual([(5 + 1e9) % 12, ['one'], false])
    expect(r.crossings.filter((c) => c.threshold.id === 'one').length).toBe(1)
    expect(r.crossings.filter((c) => c.threshold.id === 'lap').length).toBe(1000)
    expect(r.crossings.every((c) => c.from === 5 && c.to === r.state.value)).toBe(true)
    expect(r).toEqual(step(spec, newClock(spec), 12000 + 1e9 % 12))
    expect([back.state.value, back.crossings.length]).toEqual([(((5 - 1e9) % 12) + 12) % 12, 1000])
    expect(step(spec, newClock(spec), 12000).crossings.length).toBe(1001)
    expect(step(spec, newClock(spec), 12007).crossings.length).toBe(1002)
    expect(step(spec, newClock(spec), 12012).crossings.length).toBe(1001)
    expect(step(spec, newClock(spec), 24000 + 7)).toEqual(step(spec, newClock(spec), 12007))
    expect(step({ ...spec, ends: 'stop' }, newClock(spec), 1e9).overrun).toBe(1e9 - 6)
    expect(readme).toMatch(/for up to 1000 laps: a longer step lands where the full step lands and fires as a step of 1000 laps plus the rest/)
  })
  it('K640 a step that is not a finite number throws, on a stop row and on a wrap row', () => {
    for (const ends of ['stop', 'wrap'] as const) {
      const spec: ClockSpec = { spaces: 12, start: 5, ends, thresholds: [] }
      for (const by of [NaN, Infinity, -Infinity, undefined, null, 'x', '2', true]) expect(() => step(spec, newClock(spec), by as number), `${ends} ${String(by)}`).toThrow('clock: a step must be a finite number')
      expect(step(spec, newClock(spec), 0)).toEqual({ state: { value: 5, fired: [] }, crossings: [] })
    }
    expect(readme.split(/\r?\n/).find((l) => l.startsWith('4. '))).toMatch(/An amount that is not a finite number \(NaN, Infinity, text, nothing\) throws/)
  })
  it('K640 checkClock reports once that is not a boolean, unknown keys, id and kind that are not text, values that is not an object of lists', () => {
    const t = { id: 'a', at: 2, on: 'landOrPass', kind: 'k' }
    const of = (x: unknown) => checkClock(x as ClockSpec)
    for (const once of ['false', 'yes', 1, null]) expect(of({ spaces: 6, start: 0, thresholds: [{ ...t, once }] })).toEqual(['threshold a: once is not true or false'])
    expect(of({ spaces: 4, start: 3, end: 'wrap', thresholds: [] })).toEqual(['unknown key end'])
    expect(of({ spaces: 4, start: 3, dir: 'down', thresholds: [] })).toEqual(['unknown key dir'])
    expect(of({ spaces: 6, start: 0, thresholds: [{ ...t, dir: 'either' }] })).toEqual(['threshold a: unknown key dir'])
    expect(of({ spaces: 6, start: 0, thresholds: [{ ...t, onec: true }] })).toEqual(['threshold a: unknown key onec'])
    expect(of({ spaces: 6, start: 0, thresholds: [{ ...t, id: 7 }] })).toEqual(['threshold 7: id is not text'])
    expect(of({ spaces: 6, start: 0, thresholds: [{ ...t, id: { x: 1 } }] })).toEqual(['threshold 0: id is not text'])
    expect(of({ spaces: 6, start: 0, thresholds: [{ ...t, kind: 5 }] })).toEqual(['threshold a: kind is not text'])
    expect(of({ spaces: 6, start: 0, thresholds: [{ ...t, kind: { x: 1 } }] })).toEqual(['threshold a: kind is not text'])
    for (const values of [5, null, [[1, 2, 3, 4, 5, 6]], 'x']) expect(of({ spaces: 6, start: 0, thresholds: [], values })).toEqual(['values is not an object of lists'])
    expect(of({ spaces: 6, start: 0, direction: 'down', ends: 'wrap', thresholds: [{ ...t, direction: 'either', once: false, data: { any: 1 } }, { ...t, id: 'b', once: true, data: 0 }], values: { limit: [1, 2, 3, 4, 5, 6] } })).toEqual([])
    expect(of({ spaces: 6, start: 0, direction: undefined, ends: undefined, thresholds: [{ ...t, direction: undefined, once: undefined, data: undefined }], values: undefined })).toEqual([])
    expect(readme).toMatch(/It also reports a key it does not know/)
  })
  it('K640 README on states off the row: reached takes a value between two spaces as a number, stepsTo on a wrap row may not land', () => {
    const up: ClockSpec = { spaces: 8, start: 0, thresholds: [] }
    expect([reached(up, { value: 1.5, fired: [] }, 1), onSpace(up, { value: 1.5, fired: [] }, 1)]).toEqual([true, false])
    expect(readme).toMatch(/so is a state whose `value` is below 0 or past the row, as with `onSpace`; a hand-made `value` between two spaces, 1\.5, is not caught/)
    expect(readme).not.toMatch(/so is a state whose `value` is not on the row/)
    const loop: ClockSpec = { spaces: 4, start: 9, ends: 'wrap', thresholds: [] }
    const off = newClock(loop)
    expect([off.value, stepsTo(loop, off, 3), step(loop, off, stepsTo(loop, off, 3)).state.value]).toEqual([-1, 0, -1])
    expect(readme).toMatch(/From a state on the row, `step\(spec, state, stepsTo\(spec, state, space\)\)` lands on that space \(with `'back'` too\); from a state whose `value` is not a space[^.]*it may not\./)
    expect(readme).not.toMatch(/unknown space throws\. `step\(spec, state, stepsTo/)
  })
  it('K640 stepsTo back: the way back round a wrap row as a negative amount; the default and a stop row are as before', () => {
    const loop: ClockSpec = { spaces: ['w', 'sp', 'su', 'au'], start: 'w', ends: 'wrap', thresholds: [{ id: 'e', at: 'su', on: 'landOrPass', direction: 'either', kind: 'x' }] }
    const s = newClock(loop)
    expect([stepsTo(loop, s, 'au'), stepsTo(loop, s, 'au', 'forward'), stepsTo(loop, s, 'au', 'back'), stepsTo(loop, s, 'sp', 'back')]).toEqual([3, 3, -1, -3])
    expect(Object.is(stepsTo(loop, s, 'w', 'back'), 0)).toBe(true)
    const r = step(loop, s, stepsTo(loop, s, 'sp', 'back'))
    expect([r.state.value, ids(r.crossings), r.crossings[0]?.way]).toEqual([1, ['e:pass'], 'back'])
    const down: ClockSpec = { ...loop, direction: 'down' }
    expect([stepsTo(down, s, 'sp'), stepsTo(down, s, 'sp', 'back'), step(down, s, stepsTo(down, s, 'sp', 'back')).state.value]).toEqual([3, -1, 1])
    for (const spec of [loop, down]) for (let v = 0; v < 4; v++) for (let x = 0; x < 4; x++) {
      const at = { value: v, fired: [] }, b = stepsTo(spec, at, x, 'back')
      expect([b <= 0 && b > -4, step(spec, at, b).state.value, (stepsTo(spec, at, x) - b) % 4]).toEqual([true, x, 0])
    }
    const stop: ClockSpec = { spaces: 6, start: 1, thresholds: [] }
    expect([stepsTo(stop, newClock(stop), 4, 'back'), stepsTo(stop, newClock(stop), 0, 'back'), stepsTo({ ...stop, direction: 'down' }, newClock(stop), 4, 'back')]).toEqual([3, -1, -3])
    expect(() => stepsTo(loop, s, 'zz', 'back')).toThrow('clock: zz is not a space')
    expect(readme).toMatch(/`stepsTo\(spec, state, space, 'back'\)`: on a `wrap` clock the way back round the row as a negative amount/)
  })
  it('K640 the same answers as the frozen copy of the part before this row, on seeded random valid specs, states and whole steps', () => {
    let steps = 0, wraps = 0, crossed = 0, overruns = 0, laps = 0
    for (const seed of [12345, 777, 31337, 2026]) {
      let a = seed
      const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
      const int = (n: number) => Math.floor(rnd() * n)
      const pick = <T,>(xs: readonly T[]): T => xs[int(xs.length)] as T
      for (let k = 0; k < 1500; k++) {
        const n = 1 + int(12), named = rnd() < 0.5, names = Array.from({ length: n }, (_, i) => 's' + i)
        const sp = (i: number) => named && rnd() < 0.7 ? names[i] as string : i
        const direction = pick([undefined, 'up', 'down'] as const), ends = pick([undefined, 'stop', 'wrap'] as const)
        const thresholds: Threshold[] = Array.from({ length: int(6) }, (_, i) => {
          const dir = pick([undefined, 'forward', 'back', 'either'] as const), once = pick([undefined, true, false] as const)
          return { id: 't' + i, at: sp(int(n)), on: pick(['land', 'pass', 'landOrPass'] as const), kind: pick(['lose', 'reward', 'trigger']), ...(dir ? { direction: dir } : {}), ...(once === undefined ? {} : { once }), ...(rnd() < 0.3 ? { data: { n: i } } : {}) }
        })
        const spec: ClockSpec = { spaces: named ? names : n, start: sp(int(n)), thresholds, ...(direction ? { direction } : {}), ...(ends ? { ends } : {}), ...(rnd() < 0.3 ? { values: { v: names.map((_, i) => i * 2) } } : {}) }
        expect(checkClock(spec), JSON.stringify(spec)).toEqual([])
        let s: ClockState = newClock(spec)
        expect(s).toEqual(frozen.newClock(spec))
        for (let m = 1 + int(6); m > 0; m--) {
          const by = int(8 * n + 1) - 4 * n
          const now = step(spec, s, by), was = frozen.step(spec, s, by)
          expect(now, `seed ${seed} ${JSON.stringify(spec)} from ${s.value} by ${by}`).toEqual(was)
          expect(Object.keys(now)).toEqual(Object.keys(was))
          s = now.state
          steps++; crossed += now.crossings.length; if (now.overrun) overruns++; if (ends === 'wrap') wraps++; if (ends === 'wrap' && Math.abs(by) > 2 * n) laps++
          const all = (c: typeof clock | typeof frozen) => [c.left(spec, s), c.ended(spec, s), c.spaceOf(spec, s), c.valueAt(spec, s, 'v'), ...[...Array.from({ length: n + 2 }, (_, i) => i - 1), ...names, 'zz'].map((x) => { let d: unknown; try { d = c.stepsTo(spec, s, x) } catch (e) { d = String(e) } return [c.indexOf(spec, x), c.onSpace(spec, s, x), c.reached(spec, s, x), d, Object.is(d, -0)] })]
          expect(all(clock), `seed ${seed} ${JSON.stringify(spec)} at ${s.value}`).toEqual(all(frozen))
        }
      }
    }
    expect([steps > 15000, wraps > 4000, laps > 1000, crossed > 10000, overruns > 1000]).toEqual([true, true, true, true, true])
  }, 120000)
  it('K588 the README examples compile and print what they say', () => {
    expect(run('Use it in 10 lines')).toEqual([[], ['half'], 2, false])
    const dir = mkdtempSync(join(tmpdir(), 'clock-readme-'))
    try {
      for (const h of HEADINGS) expect(block(h), h + ' has a ts block').not.toBe('')
      const blocks = [...readme.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map((m) => m[1] ?? '')
      expect(blocks.length).toBe(5)
      const files = blocks.map((b, i) => {
        const f = join(dir, 'b' + i + '.ts')
        writeFileSync(f, b.replace(/'[^']*kit\/clock\/index'/, JSON.stringify(join(here, 'index.ts').replaceAll('\\', '/'))))
        return f
      })
      writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2023', lib: ['ES2023', 'DOM'], module: 'ESNext', moduleResolution: 'bundler', moduleDetection: 'force', types: [], strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true }, files }))
      const r = spawnSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', dir], { encoding: 'utf8' })
      expect(r.stdout + r.stderr).toBe('')
      expect(r.status).toBe(0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 120000)
})
