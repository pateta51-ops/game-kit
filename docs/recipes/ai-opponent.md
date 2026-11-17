# Add an AI opponent

**Hard rule (owner):** an opponent the player faces decides from the player's own view only. No hidden state of the real game. Use `redact(state, seat, view)` and `viewLeaks` in a test; the secrets list is `hiddenFrom(state, seat)` from `card-zones` ([card-table.md](card-table.md)). A greedy driver that reads hidden state is a test pilot only, never shipped.

Pick by need:

| Need | Use | Cost |
|---|---|---|
| A first opponent, explainable moves, cards with printed advice | [`opponent`](../../components/opponent/README.md) (rule-based) | data (advice, profiles, handlers per effect verb) plus a few hundred lines in the game |
| Tune the numbers of that opponent (weights, thresholds) | the K200 tuner in [`sim-pool`](../../components/sim-pool/README.md) (`tune`, then `validate`) | CPU hours, no new code in the game's AI |
| Strength beyond hand rules in a game with a clean pure reducer | [`learned-opponent`](../../components/learned-opponent/README.md) (value net, look-ahead, TD self-play) | an encoder, a model, weeks of self-play |

Always start with `opponent`. Move to `learned-opponent` only when validated strength is the goal and `opponent` plateaus.

## Rule-based `opponent`
1. Write advice as data beside the effect records (`when`, `needs`, `cannotUse`, `priority`...); `adviceProblems` must be empty.
2. One handler per effect verb (`judge`, `cost`); `handlerProblems(verbs, handlers)` must be empty.
3. Give the game a `Candidate` list per prompt (aligned with the legal answers) and plug `opponentDriver(...)` into `sim-pool`.
4. Tests assert the **reason** (`REASONS`), not the move. `decisionLines` shows why in tables and goldens.

## The seat
A prompt carries `seat`; a driver answers only prompts of its own seat, from `view(state, seat)`; `sim-pool` and `opponent` key drivers `bySeat`. In the live game the store answers that seat, paced and shown to the player: [game-store.md](game-store.md).

## One bot for the store and the sim (K271)
Write the bot once as a sim-pool `Bot<V>`: `choose(view, answers, rng)` gets the seat's view (the game's `view`/`redact`, never the state), the legal answers and a `DriverRng`, and returns one answer (sync: the store and the pool are sync). The rule-based opponent becomes one with `opponentBot(opponent, { candidates, timing? })`. Plug it into the live store with `defineGame({ ..., opponent: botOpponent(bot) })` and into the sim with `simGameOf(def, { drivers: { opponent: botDriverOf(def, bot) } })`: both key the rng `<seed>|opponent|<prompt id>`, so one seed gives the same answers in both (proof: `store.test.ts`, K271).

## Catch a bot that reads hidden state (K274)

Give the game's `SimGame` a `reshuffleHidden(state, seat, rng, content)` (the seat's unseen cards and deck order shuffled together, rest unchanged) and run `fuzz(module, { hidden: true })` (or `hidden: 0.2` for a share of decisions). The pool asks the driver again on the reshuffled state; a different answer is a `hidden-info` finding with seed and step. Drivers must have a pure `choose` (or say `stateful: true` and are skipped). Details: sim-pool README.

## Tuning with K200
`tune({ space, setups, play | batch: poolBatch(...), out, tag, version })` evolves weights over the same seeds per setup; `<out>/best.json` is the result. A generation's best is optimistic, so always `validate({ candidate, baseline, setups, games, seed })` on fresh seeds (training seeds are refused). Use 3,000+ games per setup at low win rates. Check a claimed correlation by intervention (change a weight, validate).

## Learned
Each game writes its own encoder (`Inputs`: `thermo`, `presence`, `value`, `perSeat`) and `Model` (`view`, `sample`, `legal`, `apply`, `over`, `encode`). `withTrace` plus `trainSelfPlay` produce the weight file. Judge strength with `validate` against the old weights and a scripted driver on the same seeds. A test named HARD RULE (two states, one view, same choice) is required.

Proof: sanity bands and validation output in the PR ([simulations.md](simulations.md)).
