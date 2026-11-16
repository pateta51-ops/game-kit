# engine-core: a worked example (K238, GAPS-3 engine B1)

One card that deals damage, a prevention and a trigger, on the kit's own fixture `fake/timed.ts`; the run is `worked-example.test.ts`. Read it beside `timing.md`.

1. **The damage.** A handler starts a batch with `would(ctx, [{ kind: 'damage', keys: { player: 'p2', source: 'p1', target: 'u1' }, amount: 3 }])` after pushing what runs next (`ctx.then({ kind: 'end' })`: tasks pushed first run after the batch). `timingHandlers(cfg)` runs the windows; `cfg.happen(ctx, occ)` does the effect from the occurrence's final numbers (`draftOf(ctx).hp -= occ.amount ?? 0`) and `cfg.event(occ)` is the log event.
2. **The prevention.** A card that says "prevent up to 2 damage" is data: `cfg.preventions = (s, occ) => [{ id: 'shield', prevention: { prevents: 'damage', max: 2 } }]`. The affected player (`keys.player`) is asked to use it or pass; a use prevents `max` (give the offer `uses: 1`, or count it in `onPrevent`, so it is not offered again; the test passes the second ask), the occurrence's `amount` drops to 1 and `happen` sees 1.
3. **The trigger.** "When you are damaged, heal 1": `cfg.triggersFor = () => [{ ability: 'heal', source: 'c1', player: 'p2' }]` and `cfg.resolveTrigger = (ctx, p) => ctx.then({ kind: 'heal' })`; push `{ kind: 'timing.triggers' }` where the after-window opens. It runs once per occurrence that happened, after the batch settles.
4. **The test.** `startTimed(game, { items })`, `applyAction(game, s, answer(s, 'hit'), null)`, then read `state.hp` and `state.log`. The same calls run in a card game's tests.
