import { describe, expect, it } from 'vitest'
import { type Challenge, type ChallengeGame, penaltiesFor, pickable, pickChallenge } from './index'

type Setup = { heroes: string[] }
const g: ChallengeGame<Setup, string, string> = { allows: (r, s) => s.heroes.every((h) => h === r), matches: (on, e) => on === e }
const lava: Challenge<string, string, number> = { id: 'lava', name: 'Lava', text: 'Only X.', restriction: 'x', penalties: [{ on: 'flip', effect: 2 }, { on: 'flip', effect: 1 }] }
const plain: Challenge<string, string, number> = { id: 'plain', name: 'Plain', text: '', penalties: [] }

describe('challenges', () => {
  it('lists only challenges whose restriction the setup meets', () => {
    expect(pickable(g, [lava, plain], { heroes: ['x'] }).map((c) => c.id)).toEqual(['lava', 'plain'])
    expect(pickable(g, [lava, plain], { heroes: ['y'] }).map((c) => c.id)).toEqual(['plain'])
  })
  it('a pick must exist and be allowed', () => {
    expect(pickChallenge(g, [lava], 'lava', { heroes: ['x'] })).toBe(lava)
    expect(pickChallenge(g, [lava], 'lava', { heroes: ['y'] })).toBeUndefined()
    expect(pickChallenge(g, [lava], 'nope', { heroes: ['x'] })).toBeUndefined()
    expect(pickChallenge(g, [lava], undefined, { heroes: ['x'] })).toBeUndefined()
  })
  it('penalties fire for matching events in order', () => {
    expect(penaltiesFor(g, lava, 'flip')).toEqual([2, 1])
    expect(penaltiesFor(g, lava, 'other')).toEqual([])
    expect(penaltiesFor(g, undefined, 'flip')).toEqual([])
  })
})
