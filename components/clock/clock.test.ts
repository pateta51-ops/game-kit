import { describe, expect, it } from 'vitest'
import { checkClock, ended, left, newClock, occurrences, onSpace, reached, setTo, spaceOf, step, valueAt, type ClockSpec } from './index.ts'

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
})
