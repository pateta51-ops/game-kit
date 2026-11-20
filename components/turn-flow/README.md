# turn-flow

Rounds, turns per seat and phases and steps inside a turn as one data table; the runner walks it and calls engine-core `boundary()` at each turn begin, turn end, phase end and round end, so `endOfTurn` / `endOfRound` / `endOfPhase` / `turnBegins` durations end with no manual call (K264). Needs `engine-core`.

## Rules for agents

**What it does:** Rounds, turns per seat and phases or steps inside a turn as one data table; a runner walks it and calls engine-core `boundary()` so turn, phase and round durations end without manual calls.

**You must:**
1. Needs `engine-core`; describe the flow as a `FlowConfig` (`phases`, `seats(s)`, `step(ctx, pos)`, optional `skip`, `rounds`, `roundEnds`, `over`).
2. Spread `flowHandlers(cfg)` into the game's `handlers` and call `startFlow(ctx)` in `setup`; it pushes the `flow.next` task.
3. Do the game's work for a position in `step`, by pushing tasks or `ctx.ask`; they run before the runner moves on.
4. End a turn early with `endTurn(ctx)` inside the turn's work: the current phase ends and the rest of the turn's phases are skipped.
5. Read the position with `flowOf(s)` and `whoseTurn(s)` (undefined once `done`); the runner state lives in `state.flow`.
6. Expect boundaries in this order: `turnBegin`, `phaseEnd`, `turnEnd`, `roundEnd`; steps get none, and a skipped turn or phase gets none.
7. Run `expireEffects` at the game's checkpoint; ended effects stay in state until then (they count nothing).
8. With `roundEnds`, expect a round with no turn played to end anyway; `over(s)` stops before the next position.

**Common mistakes:**
- Expecting out-of-turn interrupts or reactions here: they are not in this component.

- Table: `FlowConfig<G>`: `phases` (`{ id, steps? }`, in turn order), `seats(s)` (seat order, read at each turn change; a seat added or removed mid-round is fine: the turn ends for the seat that began it and the next turn goes to the seat after it in the current list, or, if it left, the one now at its place), `step(ctx, pos)` (the game's work at one position: push tasks or `ctx.ask`; they run before the runner moves on), optional `skip(s, level, pos)` (`level` `turn`, `phase` or `step`; a skipped turn or phase gets no boundaries), `rounds` (stop after that many), `roundEnds(s, pos)` (K320: asked after each turn, the round ends when it returns true, seats keep cycling inside the round, the next round starts at the first seat of `seats(s)`, `pos.seat` is the seat whose turn just ended and `pos.turn` the next index (it can equal the seat count), and a round in which no turn was played (every turn skipped, or no seats) ends anyway; default: after one turn per seat, so a solo game whose round ends when its deck runs out passes it) and `over(s)` (stop before the next position; the open phase, turn and round get their `phaseEnd`, `turnEnd` and `roundEnd`, so their durations end).
- Wire: `handlers: { ...flowHandlers(cfg), ...mine }`, start it with `startFlow(ctx)` in `setup` (pushes the `flow.next` task).
- Pass: `endTurn(ctx)` inside the turn's work: the current phase ends, the rest of the turn's phases are skipped, and the next advance fires `turnEnd` (and `roundEnd` after the last seat).
- Read: `flowOf(s)` is `state.flow` (`round`, `turn` index, `seat`, `phase`, `step`, `done` when it stopped); `whoseTurn(s)` the seat (undefined once done).
- Boundaries: `turnBegin` (player = seat), `phaseEnd` (phase = id), `turnEnd` (player = seat), `roundEnd`, in that order. Steps get none: engine-core has no step duration. Ended effects stay in state until the game's checkpoint runs `expireEffects` (they count nothing).
- Not here: what a step does, interrupts or reactions out of turn order.

## Use it in 10 lines

```ts
import { addEffect, type Ctx, type GameTypes } from '../kit/engine-core/index'
import { flowHandlers, startFlow, whoseTurn, type FlowConfig } from '../kit/turn-flow/index'

declare const ctx: Ctx<GameTypes>
const cfg: FlowConfig<GameTypes> = {
  phases: [{ id: 'start' }, { id: 'main', steps: ['act', 'check'] }, { id: 'end' }],
  seats: () => ['a', 'b'],
  rounds: 3,
  step: (c, pos) => { if (pos.phase === 'start') addEffect(c, { kind: 'plus', source: pos.seat, value: 1, duration: { until: 'endOfTurn' } }) },
}
const handlers = { ...flowHandlers(cfg) } // spread into GameRules.handlers; setup: startFlow
startFlow(ctx); console.log(whoseTurn(ctx.s), Object.keys(handlers)) // 'a' once the runner ran; ['flow.next']
```
