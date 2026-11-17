import { describe, expect, it } from 'vitest'
import { changedDir, countDown, fanFootprint, fanSpots, footprint, outSide, outSpan, outSpots, tokenRow, tuckOffset, tuckSpots } from './index.ts'

const up = { turned: false }
const turned = { turned: true }

describe('tuck geometry (Earthborne 276x386)', () => {
  it('one step is 14% right, 15% down: 39 and 58', () => {
    expect(tuckOffset(0, 276, 386)).toEqual({ x: 39, y: 58 })
  })
  it('each attachment shows an L beyond the card above', () => {
    expect(tuckSpots(up, [up, up], 276, 386)).toEqual([{ x: 39, y: 58 }, { x: 78, y: 116 }])
    expect(footprint(up, [up, up], 276, 386)).toEqual({ w: 354, h: 502 })
    expect(footprint(up, [], 276, 386)).toEqual({ w: 276, h: 386 })
  })
  it('a turned host turns what is tucked under it, so they never cross', () => {
    const s = tuckSpots(turned, [up], 276, 386)
    expect(s[0]).toEqual({ x: 39, y: 58 })
    expect(footprint(turned, [up], 276, 386)).toEqual({ w: 386 + 39, h: 276 + 58 })
  })
  it('slid out: a row right of the host, or left nearest first', () => {
    expect(outSpots(up, [up, up], 276, 386, 'right')).toEqual([{ x: 288, y: 0 }, { x: 576, y: 0 }])
    expect(outSpots(up, [up, up], 276, 386, 'left')).toEqual([{ x: -288, y: 0 }, { x: -576, y: 0 }])
    expect(outSpan([up, up], 276, 386)).toBe(576)
  })
  it('the side is right unless only the left has room', () => {
    expect(outSide(0, up, [up], 276, 386, { x: 0, w: 700 })).toBe('right')
    expect(outSide(400, up, [up], 276, 386, { x: 0, w: 700 })).toBe('left')
  })
})

describe('fan', () => {
  it('peeks above the host, the host standing lower in the box', () => {
    expect(fanSpots(2, 100, 200, { step: 0.1 })).toEqual([{ x: 0, y: -20 }, { x: 0, y: -40 }])
    expect(fanFootprint(2, 100, 200, { step: 0.1 })).toEqual({ w: 100, h: 240, host: { x: 0, y: 40 } })
  })
})

describe('tokens', () => {
  it('one token each up to 5, past it one and x N', () => {
    expect(tokenRow(3)).toEqual({ tokens: 3, times: null })
    expect(tokenRow(6)).toEqual({ tokens: 1, times: 6 })
    expect(tokenRow(2, 1)).toEqual({ tokens: 1, times: 2 })
  })
  it('a changed number is marked, a box counts down to 0', () => {
    expect(changedDir(4, 3)).toBe('bad')
    expect(changedDir(2, 3)).toBe('good')
    expect(changedDir(3, 3)).toBeUndefined()
    expect(changedDir(4, 3, false)).toBe('good')
    expect(countDown(3, 5)).toEqual({ value: 0, zero: true })
    expect(countDown(3, 1)).toEqual({ value: 2, zero: false })
  })
})
