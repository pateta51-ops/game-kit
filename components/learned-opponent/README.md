# learned-opponent

A learned opponent (K125): a value net, a one-horizon look-ahead on the game's own pure reducer, and TD(lambda) self-play on the sim-pool. Written new from the design in `docs/evaluation/outside/rftg-opponent.md`. Needs `engine-core`, `sim-pool`.

**Hard rule: the driver decides only from the seat's redacted view.** `decide(model, net, view, seat, actions)` never gets the real state; every state it plays forward is sampled from the view by `model.sample`. The test "HARD RULE" gives two states with one view and other hidden cards and expects the same choice. A game's view must hold nothing the seat cannot see (`opponent`'s `viewLeaks` checks that).

- **Encoder** (each game builds its own): `new Inputs()` then `thermo(name, n)`, `presence(name, keys)` (card ids, or card properties such as tags and costs, so new cards need no retrain), `value(name)`, `perSeat(seats, prefix => ...)` (seat-relative, self first). Fill `blank(inputs)` (all -1) with `thermo`, `present`, `setValue`; `seatOrder`, `behind` (gap to the leader), `relative(v, seat)`.
- **Net**: `newNet(names, hidden, seats)`; `forward(net, x)` → share of victory per seat, self first; `Evaluator` is the incremental pass (only changed inputs; one per decision); `trainStep` is plain backprop.
- **Weight file**: `writeWeights`/`readWeights(file, names)`, JSON `{ version, inputs, hidden, outputs, trained, names, w1, w2 }` (rows, bias last). Any input-name mismatch with the encoder throws.
- **Model** (the game supplies): `view`, `sample` (determinization: `deal(unseen, sizes, rng)` deals hidden hands, the rest is the deck order), `actor`, `legal`, `apply` (pure reducer), `over` (final scores or null), `horizon(from, now)` (end of the round...), `encode`; optional `cheap` (policy for other prompts in forward play, default random), `hash` (cache within one decision), `tieBreak` (tiny bonus added to the net value).
- **Decide**: options `samples` K (default 1), `pick: 'mean' | 'pessimistic'` (`rank`-th lowest, default the second-worst), `seed`, `target`. A final state is valued by its real result. `learnedDriver(model, net, { epsilon })` is a sim-pool `Driver` (`epsilon`: move noise).
- **Training**: `finalTarget(scores, { target: 'scores' | 'win', temperature })`; `tdTrain(net, steps, scores, { lambda = 0.7, rate })` per seat, newest first; `pretrain(net, n, make)` on synthetic end states.
- **Self-play**: export `simGame = withTrace(game, model)` (records each acting seat's features from its own view); the game's driver reads `settings.weights` and `settings.epsilon`. `trainSelfPlay({ module, file, names, generations, games, workers, epsilon, noisyGenerations })` plays each generation through `runGames`, applies TD and rewrites the file.
- **Opponent-choice predictor** (off unless the game uses it; simultaneous hidden picks): a second `Net` with one output per choice, trained toward `predictorTarget(searchScores)`; `combos(probs, cutoff)` lists the opponents' pick combinations, most likely first; `expected(ours, combos, value)`.

Strength: judge new weights with sim-pool's paired validation (K200), new against old and against a scripted driver over the same seeds; no copy of it here.

Not here: multi-round search, a role-prediction search loop, per-prompt choosers (the game's `legal` and `cheap`).
