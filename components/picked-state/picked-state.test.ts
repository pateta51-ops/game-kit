import { describe, expect, it } from 'vitest'
import { pickedAttrs, pickedState, pickedStates } from './index'

describe('picked-state', () => {
  it('nothing is dimmed before the first pick', () => {
    expect(pickedStates([1, 2, 3], () => false)).toEqual(['none', 'none', 'none'])
    expect(pickedAttrs(false, false)).toEqual({})
  })
  it('once one is picked the others of the choice are unpicked, still pressable', () => {
    expect(pickedStates([1, 2, 3], (o) => o === 2)).toEqual(['unpicked', 'picked', 'unpicked'])
    expect(pickedAttrs(false, true)).toEqual({ 'data-picked': 'unpicked' })
  })
  it('several picks', () => {
    expect(pickedState(true, true)).toBe('picked')
    expect(pickedStates([1, 2, 3], (o) => o !== 3)).toEqual(['picked', 'picked', 'unpicked'])
  })
})
