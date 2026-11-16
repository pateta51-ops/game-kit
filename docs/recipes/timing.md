# Timing windows and triggers (engine-core)

Full reference: [engine-core timing.md](../../components/engine-core/timing.md). Vocabulary: [docs/patterns/timing-vocabulary.md](../patterns/timing-vocabulary.md). Opt-in: a game that never calls `would` is unchanged.

1. **Wire**: `handlers: { ...timingHandlers(cfg), ...mine }`. `cfg.happen(ctx, occ)` does the effect from the occurrence's final numbers; `cfg.event(occ)` is emitted when it happened.
2. **Make a thing happen as a batch**: `would(ctx, [{ kind, keys, amount }], { shared, order })`. Each occurrence runs the windows in `order` (default `before`, `instead`, `prevention`), then `timing.do`.
3. **Windows**
   - `before`: `cfg.before` may ask, `cancelBatch`, `ignoreBatch`, or `insteadOf(ctx, b, ...tasks)`.
   - prevention: card data `Prevention` offers, the affected player picks (`PASS` to decline); `prevent(ctx, n)` only inside a window, else `EngineBugError`.
   - replacement: `replacementsFor` / `applyReplacement`; lowest class first; several: the affected player picks. Change numbers with `changeOccurrence`.
4. **Triggers**: collected after the batch settles through `cfg.triggersFor`; order by `turnOrder`, a prompt only when more than one is interactive and not silent, else `priority`. Name sources that just entered play with `enteredPlay` so they do not answer the event that brought them. Loops are capped (`TRIGGER_CAP`).
5. **Continuous effects**: `addEffect(ctx, { kind, source, value, duration })`, read with `effectsOf` / `sumEffects` / `anyEffect`; `boundary(...)` ends them. Layered values: `layered(...)`.
6. **Checkpoint** (`cfg.checkpoint`): after every `timing.do`, derive, state checks and triggers re-run until stable (`RECOMPUTE_CAP`); an unstable derive is an `EngineBugError` naming the moving keys.
7. **Test** with `card-harness` `Scenario` on real cards; `components/engine-core/fake/timed.ts` shows Shield, Ward, Double, Halve, Armor, Mirror fixtures.

Rules of the timing (who chooses, what is simultaneous) are never yours to decide: ask the arbiter.
