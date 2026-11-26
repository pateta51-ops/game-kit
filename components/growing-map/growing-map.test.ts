import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createBoard, neighbours } from '../board-model/index.ts'
import { applyAction, createGame, draftOf, hashValue, seedRng, type AnswerAction, type CtxRng, type Draft, type GameRules, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index.ts'
import { createGrowingMap, growMap, type GrowingMap, type OpenMapEdge, type TilePlacement } from './index.ts'

const baseLinks = [['home', 'last'], ['home', 'first']] as const
const board = createBoard([{ id: 'home', owner: 'a' }, { id: 'side', owner: 'b' }, { id: 'first' }, { id: 'last' }], baseLinks)
const edges = [{ id: 'east', space: 'home' }, { id: 'west', space: 'side' }, { id: 'later', space: 'last' }] as const
const tiles = ['amber', 'slate', 'ivory', 'azure', 'lime'] as const
const fixedOrder = { shuffle: <T>(list: readonly T[]): T[] => [...list] }
const initial = () => createGrowingMap(board, edges, tiles, fixedOrder)

function placement(tile: string): TilePlacement {
  return {
    spaces: [{ id: `${tile}-entry`, x: 2, y: 0 }, { id: `${tile}-room`, x: 3, y: 0 }],
    links: [[`${tile}-entry`, `${tile}-room`]],
    joins: [{ edge: 'east', space: `${tile}-entry` }],
    openEdges: [{ id: `${tile}-end`, space: `${tile}-room` }],
  }
}

describe('growing map', () => {
  it('joins a room by the game’s chosen edges and preserves existing board ownership and order', () => {
    const start = initial()
    const result = growMap(start, 'east', (tile, edge) => {
      expect(edge).toEqual({ id: 'east', space: 'home' })
      const room = placement(tile)
      return { ...room, joins: [...room.joins, { edge: 'west', space: `${tile}-room` }] }
    })
    expect(result.kind).toBe('grew')
    expect(result.map.tiles).toEqual(tiles.slice(1))
    expect(result.map.openEdges).toEqual([{ id: 'later', space: 'last' }, { id: 'amber-end', space: 'amber-room' }])
    expect(result.map.board.order).toEqual([...board.order, 'amber-entry', 'amber-room'])
    expect(neighbours(result.map.board, 'home')).toEqual(['last', 'first', 'amber-entry'])
    expect(neighbours(result.map.board, 'amber-entry')).toEqual(['amber-room', 'home'])
    expect(neighbours(result.map.board, 'side')).toEqual(['amber-room'])
    expect(neighbours(result.map.board, 'amber-room')).toEqual(['amber-entry', 'side'])
    expect(result.map.board.spaces.home).toBe(board.spaces.home)
    expect(result.map.board.spaces.side?.owner).toBe('b')
    expect(start).toEqual({ board, tiles, openEdges: edges })
  })

  it('leaves the top tile and original map untouched when a placement is blocked, then retries', () => {
    const start = initial()
    const rejected = growMap(start, 'east', () => null)
    expect(rejected.kind).toBe('blocked')
    expect(rejected.map).toBe(start)
    expect(growMap(rejected.map, 'east', placement)).toMatchObject({ kind: 'grew', tile: 'amber' })
  })

  it('leaves the selected marker intact if a placement policy mutates its input and fails', () => {
    const start = initial()
    expect(() => growMap(start, 'east', (_tile, edge) => {
      Object.assign(edge, { id: 'other', space: 'side' })
      throw new Error('invalid geometry')
    })).toThrow('invalid geometry')
    expect(start.openEdges).toEqual(edges)
    expect(growMap(start, 'east', placement)).toMatchObject({ kind: 'grew', tile: 'amber' })
  })

  it('grows from a newly exposed edge when the deck holds two copies of the same tile', () => {
    const start = createGrowingMap(board, edges, ['amber', 'amber'], fixedOrder)
    const next = (tile: string, edge: OpenMapEdge): TilePlacement => {
      const id = `${edge.id}-${tile}`
      return { spaces: [{ id }], links: [], joins: [{ edge: edge.id, space: id }], openEdges: [{ id: `${id}-door`, space: id }] }
    }
    const first = growMap(start, 'east', next)
    const second = growMap(first.map, 'east-amber-door', next)
    expect(second).toMatchObject({ kind: 'grew', tile: 'amber', map: { tiles: [] } })
    expect(neighbours(second.map.board, 'east-amber')).toEqual(['home', 'east-amber-door-amber'])
  })

  it('matches full board reconstruction across link subsets, join orders, and selected edges', () => {
    const spaces = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const possibleLinks = [['a', 'b'], ['a', 'c'], ['b', 'c']] as const
    const entrances = [...edges, { id: 'north', space: 'home' }]
    const start = createGrowingMap(board, entrances, tiles, fixedOrder)
    const openEdges = [{ id: 'out', space: 'c' }]
    for (let linkMask = 0; linkMask < 8; linkMask++) {
      const links = possibleLinks.filter((_, i) => (linkMask & (1 << i)) !== 0)
      for (let joinMask = 1; joinMask < 16; joinMask++) {
        const joining = entrances.filter((_, i) => (joinMask & (1 << i)) !== 0)
        for (let offset = 0; offset < spaces.length; offset++) {
          for (const ordered of [joining, [...joining].reverse()]) {
            const targets = ordered.map(({ space }) => spaces[(space === 'home' ? offset : offset + 1) % spaces.length]!.id)
            const joins = ordered.map(({ id }, i) => ({ edge: id, space: targets[i]! }))
            const expected = createBoard([...Object.values(board.spaces), ...spaces], [
              ...baseLinks, ...links, ...ordered.map(({ space }, i) => [space, targets[i]!] as const),
            ])
            for (const { id } of joining) {
              expect(growMap(start, id, () => ({ spaces, links, joins, openEdges }))).toEqual({
                kind: 'grew', tile: tiles[0], map: {
                  board: expected, tiles: tiles.slice(1), openEdges: [...entrances.filter(item => !joining.includes(item)), ...openEdges],
                },
              })
            }
          }
        }
      }
    }
  })

  it.each([
    ['empty tile', { spaces: [] }, /no spaces/],
    ['existing space', { spaces: [{ id: 'home', owner: 'changed' }] }, /existing space home/],
    ['duplicate space', { spaces: [{ id: 'same' }, { id: 'same' }] }, /duplicate space same/],
    ['off-tile link', { links: [['home', 'amber-entry']] }, /link.*new tile spaces/],
    ['wrong join owner', { joins: [{ edge: 'east', space: 'home' }] }, /join.*new tile space/],
    ['closed join', { joins: [{ edge: 'closed', space: 'amber-entry' }] }, /closed.*open edge/],
    ['missing selected join', { joins: [{ edge: 'west', space: 'amber-entry' }] }, /must join selected edge east/],
    ['duplicate join', { joins: [{ edge: 'east', space: 'amber-entry' }, { edge: 'east', space: 'amber-room' }] }, /duplicate join east/],
    ['off-tile open edge', { openEdges: [{ id: 'new', space: 'home' }] }, /new.*unknown space home/],
    ['duplicate open edge', { openEdges: [{ id: 'east', space: 'amber-room' }] }, /duplicate open edge east/],
  ] satisfies [string, Partial<TilePlacement>, RegExp][])('rejects %s without consuming a tile or edge', (_name, override, error) => {
    const start = initial()
    expect(() => growMap(start, 'east', (tile) => ({ ...placement(tile), ...override }))).toThrow(error)
    expect(start).toEqual({ board, tiles, openEdges: edges })
    expect(growMap(start, 'east', placement)).toMatchObject({ kind: 'grew', tile: 'amber' })
  })

  it('validates the initial open edges before shuffling', () => {
    let shuffles = 0
    const rng = { shuffle<T>(list: readonly T[]): T[] { shuffles += 1; return fixedOrder.shuffle(list) } }
    expect(() => createGrowingMap(board, [{ id: 'ghost', space: 'unmapped' }], tiles, rng)).toThrow('ghost names unknown space unmapped')
    expect(() => createGrowingMap(board, [edges[0], edges[0]], tiles, rng)).toThrow('duplicate open edge east')
    expect(shuffles).toBe(0)
  })

  it('refuses stale edges and empty decks before asking the placement policy', () => {
    const plan = vi.fn(placement)
    const start = createGrowingMap(board, edges, [tiles[0]], fixedOrder)
    const grown = growMap(start, 'east', plan)
    expect(grown.kind).toBe('grew')
    expect(growMap(grown.map, 'east', plan)).toEqual({ kind: 'closed-edge', map: grown.map })
    expect(growMap(grown.map, 'west', plan)).toEqual({ kind: 'empty-deck', map: grown.map })
    expect(plan).toHaveBeenCalledTimes(1)
  })
})

type MapEvent = { readonly type: 'blocked'; readonly seq: number }
  | { readonly type: 'explored'; readonly tile: string; readonly reveal: true; readonly seq: number }
interface MapState extends KernelState { readonly map: GrowingMap | null; readonly log: readonly MapEvent[] }
interface Explorer {
  readonly state: MapState
  readonly action: AnswerAction
  readonly task: KernelTask
  readonly prompt: KernelPrompt
  readonly event: MapEvent
  readonly stamped: never
  readonly options: { readonly seed: string }
  readonly rules: undefined
  readonly content: readonly string[]
}

const game: GameRules<Explorer> = {
  blank({ seed }) {
    const [a, b, c, d] = seedRng(seed)
    return { map: null, rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] }
  },
  setup(ctx) {
    draftOf(ctx).map = createGrowingMap(board, edges, ctx.content, ctx.rng) as Draft<GrowingMap>
    ctx.then({ kind: 'choose' })
  },
  handlers: {
    choose(ctx) {
      ctx.ask({ min: 1, max: 1, options: [{ id: 'east', enabled: true }, { id: 'west', enabled: true }] }, { kind: 'explore' })
    },
    explore(ctx, task) {
      if (ctx.s.map === null || task.answer?.[0] === undefined) throw new Error('missing exploration state or answer')
      const result = growMap(ctx.s.map, task.answer[0], (tile, edge) => edge.id === 'west' ? null : placement(tile))
      if (result.kind === 'grew') {
        draftOf(ctx).map = result.map as Draft<GrowingMap>
        ctx.emit({ type: 'explored', tile: result.tile, reveal: true })
      } else {
        ctx.emit({ type: 'blocked' })
        ctx.then({ kind: 'choose' })
      }
    },
  },
  contentHash: hashValue,
}

function explore(rng: CtxRng) {
  const map = createGrowingMap(createBoard([{ id: 'home' }]), [{ id: 'east', space: 'home' }], ['room'], rng)
  return growMap(map, 'east', tile => ({
    spaces: [{ id: tile }], links: [], joins: [{ edge: 'east', space: tile }], openEdges: [],
  }))
}

it('runs the README recipe in an engine setup and consumes the edge and tile', () => {
  const recipe = /^function explore\([\s\S]*?^}/m
  const readme = readFileSync(new URL('README.md', import.meta.url), 'utf8').replaceAll('\r', '')
  const source = readFileSync(new URL('growing-map.test.ts', import.meta.url), 'utf8').replaceAll('\r', '')
  expect(recipe.exec(readme.replace('export function explore', 'function explore'))?.[0]).toBe(recipe.exec(source)?.[0])
  const state = createGame({
    ...game, setup(ctx) {
      const result = explore(ctx.rng)
      expect(result).toMatchObject({ kind: 'grew', tile: 'room' })
      draftOf(ctx).map = result.map as Draft<GrowingMap>
    },
  }, { seed: 'readme' }, undefined, []).state
  expect(state.map).toEqual({
    board: createBoard([{ id: 'home' }, { id: 'room' }], [['home', 'room']]), tiles: [], openEdges: [],
  })
})

it('repeats the seeded tile draw through actual engine actions and preserves policy-refused state before retry', () => {
  const start = createGame(game, { seed: 'rooms' }, undefined, tiles).state
  const repeat = createGame(game, { seed: 'rooms' }, undefined, tiles).state
  const other = createGame(game, { seed: 'other rooms' }, undefined, tiles).state
  expect(start.map?.tiles).toEqual(repeat.map?.tiles)
  expect(start.map?.tiles).not.toEqual(other.map?.tiles)
  expect([...start.map?.tiles ?? []].sort()).toEqual([...tiles].sort())
  const answer = (state: MapState, edge: string) => applyAction(game, state, { kind: 'answer', promptId: state.prompt?.id ?? -1, picks: [edge] }, tiles)
  const refused = answer(start, 'west')
  expect(refused.events).toMatchObject([{ type: 'blocked' }])
  expect(refused.state.map).toBe(start.map)
  expect(refused.state.rng).toEqual(start.rng)
  const after = answer(refused.state, 'east')
  expect(after.events).toMatchObject([{ type: 'explored', tile: start.map?.tiles[0], reveal: true }])
  expect(after.state.map).toEqual(answer(repeat, 'east').state.map)
  expect(after.state.map?.tiles).toEqual(start.map?.tiles.slice(1))
  expect(after.state.map?.board.spaces.home?.owner).toBe('a')
  expect(start.map?.board).toBe(board)
})
