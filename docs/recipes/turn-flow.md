# Rounds, turns and phases (turn-flow)

Full reference: [turn-flow README](../../components/turn-flow/README.md).

1. **Write the table**: the phases of one turn in order, each with its steps if it has some; `seats(s)` gives seat order.
2. **Wire**: `handlers: { ...flowHandlers(cfg), ...mine }` and `setup: startFlow` (or call `startFlow(ctx)` at the end of setup).
3. **Do the work** in `cfg.step(ctx, pos)`: push the game's tasks or ask; the runner moves on when they are done.
4. **Skip** turns, phases or steps with `cfg.skip(s, level, pos)`; stop with `rounds` or `over(s)`. A pass is `endTurn(ctx)`.
5. **Durations**: `addEffect` with `endOfTurn`, `endOfRound`, `endOfPhase` or `turnBegins`; never call `boundary()` yourself for these edges.
6. **Read** `whoseTurn(s)` and `flowOf(s)` in the view and the opponent.
7. **Test**: a fake game played through several rounds (`components/turn-flow/turn-flow.test.ts`).

Turn order, who goes first and when a phase is skipped are game rules: ask the arbiter.
