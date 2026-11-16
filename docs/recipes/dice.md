# Dice

Use when a game rolls, holds, rerolls or adjusts dice. Components: `dice-tray` (logic, import from `index`), `dice-odds` (exact probabilities), `pieces-3d` (the look). What a roll means is the game's.

1. **Roll through the engine's rng**, in a handler, so the roll is seeded and replays: `roll(tray, ctx.rng)`. Never `Math.random`.
   ```ts
   const rng = { int: (max: number) => max - 1 } // in a game: ctx.rng
   const { tray } = roll(newTray([6, 6]), rng)
   const r = readRoll(tray, [{ id: 'dbl', label: 'double', test: (d) => d[0]?.value === d[1]?.value }])
   console.log(r.sum, r.first?.label) // 12 double
   ```
   Others: `toggleHold`, `hold`, `heldDice`, `adjust(tray, id, +-1)` (stays in 1..sides), `setValue`, `remove`, `rerollSelected(tray, rng, selected)` (one roll count).
2. **Roll window.** The tap order token, die, then + or -: keep a `WinState` in the UI store (`winStart`, `winPickToken`, `winPickDie`, `winBack`, `canTapDie`; `adjustId(s, '+')` gives the answer id `<token>:<die>:<sign>`). Die taps before a token are ignored. Reset it when the prompt id changes.
3. **Look.** Draw dice with `pieces-3d`: elements with `data-p3-die="d6"` and `data-v`, then `startDiceLayer(look)` once; without WebGL the element's own children show as the flat die. `registerPieceVerbs` adds `shake` and `flip` to the effect library. `rollWith(tray, rng, { onRoll })` is the animation hook (off unless given; release 1.0 has none).
4. **Odds** for tests and sanity bands: `chance(3, (dice) => dice.includes(6))` from `dice-odds`; compare a simulated rate with it.

Pitfalls
- A tray is plain data: keep it in the engine state, not a UI store, so it survives JSON, saves and replay.
- `roll` skips held dice; the ids rolled come back in `rolled` for the animation.
- Hold, adjust and select that change the result are engine answers, not UI-only state, or replay and undo disagree.
- `startDiceLayer` returns `stop()` (and `null` without WebGL): call it on unmount; it frees the one WebGL context.

Proof: a seeded engine test whose rolls equal on replay; `chance` against the simulated rate; `npm run check`. Demo of the pieces: `mountPiecesDemo` from `pieces-3d`.
