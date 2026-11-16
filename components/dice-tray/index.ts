import { defineMachine, transition } from '../state-machines/index';

export interface Die { id: number; sides: number; value: number; held: boolean; kind?: string }
export interface Rng { int(max: number, name?: string): number }
export interface Tray { dice: readonly Die[]; rolls: number }

/** `specs`: the sides of each die in play (and an optional kind, e.g. 'bonus'). Unrolled dice have value 0. */
export const newTray = (specs: readonly (number | { sides: number; kind?: string })[]): Tray => ({
  dice: specs.map((s, id) => (typeof s === 'number' ? { id, sides: s, value: 0, held: false } : { id, sides: s.sides, value: 0, held: false, ...(s.kind ? { kind: s.kind } : {}) })),
  rolls: 0,
})

/** Rolls every die not held (or only `only` ids) with `rng.int(sides) + 1`, in die order; returns the new tray and the ids rolled. */
export function roll(t: Tray, rng: Rng, only?: readonly number[]): { tray: Tray; rolled: number[] } {
  const rolled: number[] = []
  const dice = t.dice.map((d) => {
    if (d.held || (only && !only.includes(d.id))) return d
    rolled.push(d.id)
    return { ...d, value: rng.int(d.sides) + 1 }
  })
  return { tray: { dice, rolls: t.rolls + 1 }, rolled }
}

export const hold = (t: Tray, id: number, held = true): Tray => ({ ...t, dice: t.dice.map((d) => (d.id === id ? { ...d, held } : d)) })
export const toggleHold = (t: Tray, id: number): Tray => ({ ...t, dice: t.dice.map((d) => (d.id === id ? { ...d, held: !d.held } : d)) })
/** A +/-1 adjustment: the value stays within 1..sides; an unrolled die or an out-of-range result leaves it unchanged. */
export const adjust = (t: Tray, id: number, by: number): Tray => ({ ...t, dice: t.dice.map((d) => (d.id === id && d.value > 0 && d.value + by >= 1 && d.value + by <= d.sides ? { ...d, value: d.value + by } : d)) })
export const remove = (t: Tray, id: number): Tray => ({ ...t, dice: t.dice.filter((d) => d.id !== id) })
export const values = (t: Tray): number[] => t.dice.map((d) => d.value)
export const heldDice = (t: Tray): Die[] => t.dice.filter((d) => d.held)

/** A meaning of a roll: the game writes `test` and `label`. */
export interface Meaning<T = string> { id: string; test(dice: readonly Die[]): boolean; label: T }
/** The roll window's content: the dice, their sum and every meaning that holds, in the given order. */
export interface RollResult<T = string> { dice: readonly Die[]; values: number[]; sum: number; meanings: Meaning<T>[]; first: Meaning<T> | undefined }
export function readRoll<T = string>(t: Tray, meanings: readonly Meaning<T>[]): RollResult<T> {
  const v = values(t)
  const m = meanings.filter((x) => x.test(t.dice))
  return { dice: t.dice, values: v, sum: v.reduce((a, b) => a + b, 0), meanings: m, first: m[0] }
}

/** Optional hook for a roll animation: off unless given (release 1.0 has none). */
export interface RollHook { onRoll?(rolled: readonly number[], tray: Tray): void }
export function rollWith(t: Tray, rng: Rng, hook?: RollHook, only?: readonly number[]): Tray {
  const r = roll(t, rng, only)
  hook?.onRoll?.(r.rolled, r.tray)
  return r.tray
}

/** The roll window's tap order: a token (+/-1 source), then a die, then + or -. */
export type RollWin = 'idle' | 'token' | 'die'
export type RollWinEvent = 'pickToken' | 'pickDie' | 'back'
export const rollWindow = defineMachine<RollWin, RollWinEvent>({
  id: 'dice-tray-roll-window', initial: 'idle',
  states: { idle: { on: { pickToken: 'token' } }, token: { on: { pickToken: 'token', pickDie: 'die', back: 'idle' } }, die: { on: { pickDie: 'die', pickToken: 'token', back: 'idle' } } },
  describe: { purpose: 'Which adjustment source and which die the player has tapped before + or -.', source: 'components/dice-tray/index.ts', stateLivesIn: 'the game UI store' },
})
export const step = (s: RollWin, e: RollWinEvent): RollWin => transition(rollWindow, s, e)

/** The roll window's pick state (7th Inning Stretch, proven): the game keys it by prompt id and resets it when the id changes. */
export interface WinState { win: RollWin; token: string; die: number | null }
export const winStart = (): WinState => ({ win: 'idle', token: '', die: null })
export const winPickToken = (s: WinState, token: string): WinState => ({ ...s, win: step(s.win, 'pickToken'), token })
/** A die tap counts only after a token is picked (idle ignores it). */
export const winPickDie = (s: WinState, die: number): WinState => (s.win === 'idle' ? s : { ...s, win: step(s.win, 'pickDie'), die })
export const winBack = (s: WinState): WinState => (s.win === 'idle' ? s : { ...s, win: step(s.win, 'back'), die: null })
/** Dice are tappable once a token is picked. */
export const canTapDie = (s: WinState): boolean => s.win !== 'idle'
/** The `+`/`-` answer id the window leads to, `<token>:<die>:<sign>` (null before a die is picked). */
export const adjustId = (s: WinState, sign: '+' | '-'): string | null => (s.win === 'die' && s.die !== null ? `${s.token}:${String(s.die)}:${sign}` : null)

/** Selecting dice to reroll together: tap toggles; the reroll button needs `min` picked. */
export const toggleSelect = (sel: readonly number[], id: number): number[] => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
export const canReroll = (sel: readonly number[], min = 1): boolean => sel.length >= min
/** One die picked at a time (a die's own answers); tapping it again clears. */
export const selectOne = (cur: number | null, id: number): number | null => (cur === id ? null : id)
/** Rerolls the selected dice together, in die order; the roll count rises once. */
export const rerollSelected = (t: Tray, rng: Rng, sel: readonly number[]): { tray: Tray; rolled: number[] } => roll(t, rng, sel)
/** A die's value set by the game (a "set to" ability), clamped to 1..sides. */
export const setValue = (t: Tray, id: number, value: number): Tray => ({ ...t, dice: t.dice.map((d) => (d.id === id ? { ...d, value: Math.min(d.sides, Math.max(1, value)) } : d)) })
