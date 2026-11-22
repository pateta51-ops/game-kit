import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import * as clock from './index.ts'
import { checkClock, ended, left, newClock, occurrences, onSpace, reached, setTo, spaceOf, step, stepsTo, valueAt, type ClockSpec } from './index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const readme = readFileSync(join(here, 'README.md'), 'utf8')
const HEADINGS = ['Use it in 10 lines', 'Recipe: a dry run', 'Recipe: a lose space that is not the last']
const block = (heading: string) => /```ts\r?\n([\s\S]*?)```/.exec(readme.split(/^## /m).find((p) => p.startsWith(heading + '\n') || p.startsWith(heading + '\r')) ?? '')?.[1] ?? ''
const run = (heading: string): unknown => {
  const code = block(heading)
  expect(code, heading + ' has a ts block').not.toBe('')
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    (new Function('require', 'exports', ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText) as (r: () => unknown, e: object) => void)(() => clock, {})
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
    expect(run('Recipe: a lose space that is not the last')).toEqual(['lost', true])
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
  it('K588 the README examples compile and print what they say', () => {
    expect(run('Use it in 10 lines')).toEqual([[], ['half'], 2, false])
    const dir = mkdtempSync(join(tmpdir(), 'clock-readme-'))
    try {
      const files = HEADINGS.map((h, i) => {
        expect(block(h), h + ' has a ts block').not.toBe('')
        const f = join(dir, 'b' + i + '.ts')
        writeFileSync(f, block(h).replace(/'[^']*kit\/clock\/index'/, JSON.stringify(join(here, 'index.ts').replaceAll('\\', '/'))))
        return f
      })
      writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2023', lib: ['ES2023', 'DOM'], module: 'ESNext', moduleResolution: 'bundler', moduleDetection: 'force', types: [], strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, verbatimModuleSyntax: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true }, files }))
      const r = spawnSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', dir], { encoding: 'utf8' })
      expect(r.stdout + r.stderr).toBe('')
      expect(r.status).toBe(0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 120000)
})
