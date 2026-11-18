// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { buildStamp, FRESH_KEY, watchBuild, type BuildStore } from './fresh.ts'

const mem = (): BuildStore & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) } } }
const fake = (live: () => string) => vi.fn((_u: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ build: live() }) }))

describe('watchBuild on a fake game', () => {
  it('reloads once for a newer build and not again (no loop)', async () => {
    const reload = vi.fn(); const store = mem()
    const w = watchBuild({ build: 'a', safe: () => true, fetch: fake(() => 'b'), reload, store })
    await w.check(); await w.check(); await w.check()
    expect(reload).toHaveBeenCalledTimes(1)
    const again = watchBuild({ build: 'a', safe: () => true, fetch: fake(() => 'b'), reload, store })
    await again.check()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(store.m.get(FRESH_KEY)).toBe('b')
    w.stop(); again.stop()
  })
  it('waits while the game is not safe, then reloads', async () => {
    const reload = vi.fn(); let safe = false
    const w = watchBuild({ build: 'a', safe: () => safe, fetch: fake(() => 'b'), reload, store: mem() })
    expect(await w.check()).toBe(false)
    safe = true
    expect(await w.check()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    w.stop()
  })
  it('does nothing on the same build, a failed fetch or a bad answer', async () => {
    const reload = vi.fn()
    for (const f of [fake(() => 'a'), vi.fn(() => Promise.reject(new Error('off'))), vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }))]) {
      const w = watchBuild({ build: 'a', safe: () => true, fetch: f, reload, store: mem() })
      await w.check(); w.stop()
    }
    expect(reload).not.toHaveBeenCalled()
  })
  it('flushes first and asks safe again', async () => {
    const reload = vi.fn(); let safe = true
    const w = watchBuild({ build: 'a', safe: () => safe, flush: () => { safe = false; return Promise.resolve() }, fetch: fake(() => 'b'), reload, store: mem() })
    expect(await w.check()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    w.stop()
  })
  it('a throwing flush does not kill the watcher', async () => {
    const reload = vi.fn(); let boom = true
    const w = watchBuild({ build: 'a', safe: () => true, flush: () => (boom ? Promise.reject(new Error('x')) : Promise.resolve()), fetch: fake(() => 'b'), reload, store: mem() })
    expect(await w.check()).toBe(false)
    boom = false
    expect(await w.check()).toBe(true)
    w.stop()
  })
  it('stop cancels an in-flight run and removes the listeners', async () => {
    const reload = vi.fn(); let release = () => {}
    const add = vi.spyOn(window, 'addEventListener'); const rm = vi.spyOn(window, 'removeEventListener')
    const w = watchBuild({ build: 'a', safe: () => true, flush: () => new Promise<void>((r) => { release = r }), fetch: fake(() => 'b'), reload, store: mem() })
    const p = w.check()
    await Promise.resolve(); await Promise.resolve()
    w.stop(); release()
    expect(await p).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    for (const n of ['online', 'pageshow']) expect(rm.mock.calls.some((c) => c[0] === n)).toBe(add.mock.calls.some((c) => c[0] === n))
    add.mockRestore(); rm.mockRestore()
  })
  it('buildStamp shortens the commit', () => {
    expect(buildStamp('0123456789abcdef')).toBe('0123456')
    expect(buildStamp(undefined)).toBe('unknown')
  })
})
