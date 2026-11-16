# Keldon Jones's Race for the Galaxy AI: how it works and what a port needs

Source: https://github.com/bnordli/rftg (the URL worked; shallow clone, default branch, 15 Nov 2026). All paths below are under `src/`. Nothing was built or run.

## What I read and what I did not

Read in full:
- `net.c` (714 lines), `net.h` (111), `learner.c` (250), `do_train` (training shell script), `README`.
- `ai.c` lines 1-6400, 7520-7810 and 8195-8899 (of 8899).
- First lines of `COPYING`; the 3-line headers of six weight files in `network/`; first ~45 input names of `rftg.eval.0.2.net`.

Read only as excerpts:
- `ai.c` 6876-6960 (start of `ai_choose_consume`); for the rest of 6400-7520 and 7810-8195 I saw only the function list (defend, takeover-prevent, upgrade, trade, consume, consume-hand, good, produce, discard-produce, search, Oort). These are per-prompt choosers of the same pattern; I did not verify each.
- `engine.c`: only lines ~655-730, 1365-1430, 1715-1745, 2135-2165, 2585-2605, 3340-3400, 6450-6480, 7420-7440 and a grep for `simulation`/`fake_hand`.
- `rftg.h`: only the `decisions` struct (783-815), a few `player`/`game` fields and constants via grep.

Not read: `gui.c`, `ai_client.c`, `server.c`, `client.c`, `dumpnet.c`, `replay.c`, `init.c`, `loadsave.c`, `changelog.md`, top-level `readme.md` (a grep for AI/neural/train in it returned nothing), `cards.txt`. I found no design document for the AI; everything below comes from code and comments. I did not find any statement of playing strength in the files I read.

## 1. Architecture

Two small networks, both the same 3-layer type (`net.h` 29-100, "A two-layer neural net"): inputs + bias -> 50 tanh hidden units + bias -> outputs passed through a softmax (`compute_net`, `net.c` 194-307; outputs are `exp(sum - sum_of_first)` normalised to probabilities). Hidden size is fixed at 50 for both (`ai.c` 56, 61). Weights are doubles, initialised uniformly in [-0.1, 0.1] (`net.c` 33-37).

**Evaluation network `eval`** (`ai.c` 38): input = one game state from one player's point of view; output = one probability per player (`make_learner(&eval, n, EVAL_HIDDEN, g->num_players)`, 1314), slot 0 = the evaluating player, the rest in seat order after them. It is a "share of victory" estimate, not a scalar value.

**Role-prediction network `role`** (`ai.c` 43): input = public state from the predicted player's seat; output = probability of each role choice: 7 (base), 23 (2-player advanced, pairs), 15 (third expansion, with Search and prestige variants), 76 (advanced + third expansion) (`ai.c` 66-69, tables 968-1015, `fill_adv_combo` 3340-3403).

**One pair of networks per configuration, not shared.** File name is `network/rftg.{eval|role}.<expansion>.<players>[a].net` (`ai_initialize`, 130-131, 159-160). The folder holds 72 `.net` files = 36 configurations (expansions 0-6, 2-6 players, plus 2-player advanced). Input count changes with configuration because every card design in that expansion set gets its own input (`setup_nets`, 1039-1058). Header sizes I read: eval 0.2 = 704 in / 50 / 2 out; eval 0.3 = 982/50/3; eval 3.4 = 2099/50/4; eval 5.5 = 1922/50/5; role 0.2 = 605/50/7; role 0.2a = 621/50/23; role 3.4 = 1919/50/15.

### Eval inputs (names built in `setup_nets` 1063-1311; values set in `eval_game` 2284-2560 and `eval_game_player` 1942-2238)

Encoding style: almost everything is a "thermometer" code, input i = +1 if the count is greater than i, else -1 (all inputs are first cleared to -1, line 2318). Card identity is one input per card design (+1 if present).

Global (37, plus 40 with goals):
- Game over: 1
- VP pool remaining per player: 12
- Most cards any player has built ("Max active"): 12
- "Clock" (rounds-left estimate = min(12 - max built, pool/players), forced to 0 after round 20): 12 (2351-2369)
- Goals active 20 + goals available 20, only in goal expansions

Private to the evaluating player:
- Card in hand, one per design: C inputs (1.0 in hand, 0.5 for a "saved" card) (2392-2431). **Left blank when evaluating a simulated state from another player's seat** (2408, 2421).
- Buildable developments in hand: 5; buildable worlds in hand: 5 (2448-2488)

Per player, self first then opponents in seat order, public information only ("We only use public knowledge in this function", 1940):
- Active (tableau) card, one per design: C
- Goods on each goods-holding design: G (value = number of goods)
- Total goods: 6; good types present: 4
- Cards in hand (count only): 12
- Cards seen this round: 15
- Developments built: 10; worlds built: 10; six-cost developments: 5
- Military strength: 10
- Flags: conflicting military, skipped last Develop, skipped last Settle, special Explore power: 4
- "Consume ability" (hand-coded estimate of VP from consume/produce engine, `consume_ability` 531-963): 6; immediate consume: 6
- Goals claimed: 20 (goal expansions); prestige action used 1 + prestige 15 (third expansion)
- Winner flag: 1
= 89 + C + G per player in the base game.

Relative standing, per player (`eval_game_leader` 2244-2278): points behind the leader 20, built cards behind 5, hand cards behind 10, goods behind 5 (= 40 per player; +5 prestige behind in the third expansion).

Total base game = 47 + C + P x (129 + C + G). The two headers I read (704 for 2 players, 982 for 3) give C = 101 and G = 48 by arithmetic; I did not count the card file.

The final score used for decisions is not the raw network output: `score = win_prob[0] + end_vp*0.001 + hand*0.0002 + (winner ? 0.2 : 0) + 0.1 - (game_over ? 0.1 : 0)` (2544-2546): small hand-written tie-breakers for points, hand size, and winning outright.

### Role inputs (`setup_nets` 1339-1574; `predict_action` 2894-3115, `predict_action_player` 2629-2848)

Per player (predicted player first): tableau cards C, developments 10, worlds 10, goods per design G, goods 6, good types 4, hand count 12, cards seen 15, military 10, 3 flags, consume ability 6, immediate consume 6, previous round's role(s) 10 (`MAX_ACTION` = 10, `rftg.h` 140). Then the same "behind the leader" block (40 per player), VP pool 12, max built 12, clock 12, goals. No hand contents.

Last block, one input per output: a **"raw" score for each role**, computed by simulating "this player picks this role and nobody else picks anything", completing the round, evaluating with the eval network, and turning the scores into a softmax with temperature 1/20 (3010-3082). So the role network is a learned correction on top of a one-step search with the value network; it is not predicting from the board alone.

## 2. How a decision is made

**Entry point.** The engine calls `ai_make_choice(g, who, type, list, nl, special, ns, arg1..3)` (8199-8474), a switch over ~25 prompt types (`CHOICE_ACTION`, `CHOICE_START`, `CHOICE_DISCARD`, `CHOICE_PLACE`, `CHOICE_PAYMENT`, `CHOICE_CONSUME`, `CHOICE_GOOD`, ...). The engine passes the legal options in `list`/`special`; each `ai_choose_*` function returns its pick, which is appended to the player's choice log (8422-8473).

**The universal pattern** (seen in every chooser I read): for each legal option, `simulate_game` (memcpy the whole game struct, 196-229), apply the option with the engine's own callback (`discard_callback`, `place_card` + `develop_action`/`settle_finish`, `payment_callback`, ...), call `complete_turn(&sim, COMPLETE_ROUND)` to play out the rest of the current round (309-460), call `eval_game(&sim, who)`, keep the best (`score_better`, 4272, with a 1e-6 tolerance). Subsets (discards, payments) are enumerated exhaustively by bitmask recursion (`ai_choose_discard_aux` 4280-4339, `ai_choose_pay_aux1/aux2` 5754-5979).

**Search depth.** One round, never further. `complete_turn` finishes the current phase and runs the remaining selected phases through the real engine phase functions (`phase_develop`, `phase_settle`, `phase_consume`, `phase_produce`, 392-402); inside those, every player's decisions in the simulated copy are again answered by `ai_func` (simulate_game sets all players' `control` to the AI, 223-227), so nested choices recurse. There is no tree search across rounds; the value network carries all long-range judgement. Exception at game start: start world x initial discards x every first-round role is enumerated (`ai_choose_start` 5161-5212, `ai_choose_start_aux` 5049-5156; same idea in `ai_choose_discard_aux_action` 4344-4445).

**Role selection, the simultaneous hidden choice** (`ai_choose_action` 3979-4264):
1. For each opponent, `predict_action` gives a probability per role (4020-4064); illegal roles are zeroed.
2. Opponent role combinations are enumerated recursively with a probability cut-off (`ai_choose_action_combo` 3823-3885). Threshold = product of each opponent's top probability / 8; 0 for 2 players (check everything); x5 for 4 players, x7 for 5+ (4063, 4116-4123). Combos are sorted most-likely first (4136).
3. For each combo, each of our legal roles is simulated to end of round and evaluated; `scores[role] += eval * prob(combo)` (`ai_choose_action_aux` 3892-3974). So it is an **expected value over predicted opponent choices**, not minimax. Our roles scoring below `(0.3 + prob_used) * best` are dropped as the loop proceeds (3927), and the loop stops when only one of our roles is still being tried (4155-4161). A first pass with "no opponent picks anything" seeds the scores (4149).
4. Pick the highest sum (4183-4203).
- 2-player advanced (two roles each): same idea over the opponent's pairs in probability order until 80% of the probability mass is covered (3628-3651), trying fewer of our own pairs as mass is used up (3489).
- Cards that let a player choose after seeing the others' roles set the probabilities to 0/1 (4067-4092).

**Hidden and random information: no averaging over full determinizations.** Instead the engine itself runs in a "simulation mode" with counted, faceless cards:
- A simulated draw does not put a card in hand: it increments `fake_hand` and moves the top deck card to the discard pile (`draw_card`, `engine.c` ~680-698). The simulated random seed is fixed to 1 (`ai.c` 217). Simulated discards and payments only increment `fake_discards` (`ai_choose_discard` 4463-4472; `engine.c` ~7426-7431). Hand size in the features is `hand + fake_hand - fake_discards` (2062).
- When more cards have been spent than drawn, the AI's real hand cards are removed in order of a precomputed "most discardable" list (`ai_prepare_discard` 3299-3335, built at every real prompt at 8206-8214; applied by `ai_quick_discard` 271-300 at 446-459).
- **Own Explore** (the one place real sampling happens): `ai_explore_sample` (4917-5044) draws 10 samples (seeds 0-9) from the cards whose location this player does not know (per-card "known to player i" bits, `MISC_KNOWN_*`, `rftg.h` 213-219; test at 4952), picks the best keep/discard for each, sorts by score and uses **the second-worst sample** (5019), a deliberately pessimistic point estimate. The sample is cached for the turn (`explore_seen`, 3269-3289) so all options are compared against the same imagined draw. Sampled cards are flagged `MISC_FAKE`, and a fake card may not be chosen for placement in a phase the AI itself called (5692-5697).
- **Opponent's card play in a simulated Develop/Settle** (`ai_choose_place_opp` 5278-5542): the opponent's hand is treated as unknown. It samples about (hand size + cards drawn this round, +2 if they called the phase, cap 20) cards of the right type from the cards unknown to the simulating player (5357-5374, 5380-5397; fixed seed 0), simulates each being placed, scores each **from the simulating player's own point of view** (5272), adds five "places nothing" entries (5499-5508), sorts ascending and takes the 4th-lowest, or the lowest if that opponent called the phase (5510-5521). Heuristics: an opponent who skipped the phase last time without drawing skips again (5298-5300); one who chose Trade with no goods is assumed to settle a windfall world (5303-5311). Results are cached per turn (`lookup_opp_place` 1801-1868).
- Gambling prompts are exact expectations over unknown cards (`ai_choose_lucky` 7525-7597, `ai_choose_ante` 7627-7709), computed only in the real game.
- Simplifications inside simulations: opponents' consume choices use a fixed heuristic (`score_consume`, 6920-6940); Search just draws a card (`engine.c` ~2145-2150); some prompts return a default in simulation (`ai_choose_save` 4644-4649, `ai_choose_lucky` 7533, `ai_choose_ante` 7636).

**Time or sample limits.** No clock. Cost is bounded by fixed caps and pruning: 10 explore samples; at most 20 opponent-placement samples; the probability thresholds above; greedy one-at-a-time discarding when the subset space is large (4476-4575: more than 20 cards, or more than 5 cards with more than 2 discards); at most 15 cards considered for payment (5995); a hash-keyed cache of evaluated states (`lookup_eval` 1694-1796, cleared each training step); and an incremental forward pass that only updates hidden sums for inputs that changed since the last call (`compute_net`, `net.c` 203-261).

## 3. Training

**Algorithm: self-play temporal-difference learning, TD(lambda) with lambda = 0.7, online, one game at a time, all seats played by the same two networks.**

- Loop (`learner.c` 69-250): every seat gets `ai_func` (178); for n games: `init_game`, `begin_game`, `while (game_round(&g));`, `score_game`, `declare_winner`, then `game_over(g, j)` for each seat (192-239); `shutdown` saves the weights (242-246; `ai_shutdown`, `ai.c` 8566-8595). Options: `-p` players, `-e` expansion, `-a` advanced, `-n` games (default 100), `-f` learning-rate factor, `-r` seed.
- Per-round update (`perform_training`, 2565-2624), called for each player at the start of every round from `ai_choose_action` (3990): evaluate the current real state, push its input vector onto a history buffer tagged with the player (`store_net`, `net.c` 312-350; at most 120 entries, shared by all seats, cleared after each game), then use **the network's current output as the target for every earlier state of that same player**, newest first, with weight multiplied by 0.7 per step back (2602-2620). Deltas are accumulated and applied once (`apply_training`, `net.c` 483-514).
- End of game (`ai_game_over`, 8479-8561): the target becomes the real result, a softmax over final scores: `exp(0.3 * (score_i - max))` normalised, with +1 point for the winner (8505-8545). The final state is trained at weight 1, earlier states at 0.7, 0.49, ... So the network learns "share of victory" graded by point margin, not just win/lose.
- Update rule (`train_net`, `net.c` 373-478): plain gradient descent on squared error of the softmax outputs, backpropagated through the tanh layer; no momentum, no batches, no replay beyond the current game.
- Learning rates: eval 0.0001 x factor, role 0.0005 x factor (`ai.c` 124, 153).
- Schedule (`do_train`): 250 runs of `./learner`, factor 100 for the first 100 runs and 1 after; `-n` is not passed, so 100 games per run = 25,000 self-play games per configuration. The eval files' headers say 30000 training iterations = those 25,000 plus the 5,000 pre-training steps below. (The role files' headers say 0; I did not find out why.)
- Pre-training (`initial_training`, 8820-8899), run when no weight file exists: 5,000 synthetic "game over" states with random scores 0-49 and the correct winner flag, at 10x learning rate, so the net starts out knowing that points and winning are good (comment 8812-8819).
- **Role network** (4208-4260; advanced 3721-3781): right after choosing its own role, the AI runs `predict_action` on itself and trains the role net toward `softmax(20 * score_i / best_score)` over the search scores of its own options. So opponents are modelled as "a player who chooses like me". The learner prints hit rate, average predicted probability of the chosen role, and both nets' errors at shutdown (8588-8591).
- **Exploration: none explicit.** Choices are always the arg-max. I found no epsilon, noise or temperature on move selection in the parts of `ai.c` I read (the only random calls are the fixed-seed samplers and `initial_training`). Variety comes from the shuffled deck, as in TD-Gammon's dice.
- The update code runs inside `ai_choose_action`/`ai_game_over` whenever the AI plays, not only in the learner; what learning-rate factor the GUI and server pass to `init`, and whether they save weights, is in files I did not read.

## 4. The seam between AI and rules

- A function-pointer table per player, `decisions` (`rftg.h` 783-815): `init`, `notify_rotation`, `prepare_phase`, `make_choice`, `wait_answer`, `explore_sample`, `game_over`, `shutdown`, `private_message`. The AI's table is `ai_func` (`ai.c` 8600-8611); a human GUI or network client supplies another. `player.control` points at it (`rftg.h` 828-829).
- The engine asks through one funnel, `ask_player` (`engine.c` ~1373-1400): if the player's **choice log** has an unconsumed entry it replays it, otherwise calls `control->make_choice`, then reads the answer back out of the log (`extract_choice`). Every decision is a (type, return value, list, special) record in that log; that is also the replay/save format.
- Same rules code for real play and simulation: the AI copies the `game` struct by value and calls the engine's public phase and action functions on the copy. The engine has `if (g->simulation)` branches (about 90 hits in my grep) to suppress messages, replace draws with fake counters, and, in Develop/Settle, to ask the AI to guess each opponent's placement first (`engine.c` ~3349-3389). So the engine is not AI-agnostic: it knows about `simulation`, `sim_who`, `fake_hand`, `fake_discards`, `MISC_FAKE`, and the `explore_sample` hook (`engine.c` ~2595-2603).
- What the AI may see: **it is handed the complete true game state**, opponents' hands and deck included. Fair play is by discipline inside `ai.c`: per-card known-to-player bits; hand inputs blanked for other seats in simulations (2408, 2421); opponents' plays drawn from "unknown to me" cards rather than their real hand (5363); simulated draws are faceless. Nothing structural prevents a leak.

## 5. Strengths, weaknesses, known problems (from the code)

Strengths
- Very little machinery: two 50-unit nets, one-round look-ahead, no rollouts to game end. Fast enough for interactive play with no time control.
- Rules knowledge is not duplicated: move generation and consequences come from the engine.
- Opponent modelling for simultaneous choices is cheap and principled (expected value over a learned distribution, with pruning by probability mass).
- The value target is graded by score margin, and inputs include relative-standing features, so it learns tempo ("clock") and not only raw points.
- Input names are stored in the weight file and checked on load (`load_net`, `net.c` 601-623), which catches a feature layout drift.

Weaknesses and admitted hacks
- `claim_card`: "XXX This entire function is nasty" (3215); it swaps an imagined card out of wherever it really is.
- `ai_choose_settle`: "XXX Just use first power" (6126); `ai_choose_oort_kind` is an XXX stub (8191); second placement is assumed never to happen for one power (5338).
- Arbitrary caps marked XXX: 20/30 cards (4475, 4805, 6446, 7350), 15 payment cards (5995), "XXX Check for long-running game" forcing the clock to 0 after round 20 (2361), explore-sample table can overflow and abort (5041-5043).
- Pessimism constants (second-worst explore sample, 4th-lowest opponent placement, five "no placement" entries, +2 samples) are hand-tuned with no justification in comments.
- Opponent card play is scored from the simulating player's seat, i.e. "what hurts or helps me", not what is good for the opponent.
- `consume_ability` is a 430-line hand-written game-specific feature with its own approximations ("Assume 3 goods remain", 487).
- `score_better` exists because the incremental forward pass accumulates floating-point error (comment 4269-4270).
- `ai_debug` contains disabled (`#if 0`) code that no longer matches current function signatures (8722-8726, 8796-8800).
- My observation, not stated in the code: the role net is trained on the AI's own choice with its own hand visible to the "raw score" inputs (`sim_who == who`), but used on opponents with their hand blanked, so training and use see differently-informed inputs.
- My observation: no exploration and a single self-play lineage, so nothing guards against a self-reinforcing blind spot; one separate net per configuration means every new card set needs a full retrain (inputs are per card design).
- No multi-round planning: anything that pays off two rounds later must be captured by the value net.

## 6. Port assessment for a TypeScript pure-reducer card game (STCC)

### Licence

`COPYING` is the GNU General Public License **version 2**; every source header I read says "version 2 of the License, or (at your option) any later version"; `README` says "The source code is copyrighted and is placed under the GPL". Plainly: **the design and ideas described here may be re-implemented from scratch, but no code from this repository may be copied or translated into a private non-GPL project.** The trained weight files ship in the same GPL source tree; treat them the same way and do not copy them (they would be useless for another game anyway). Write the port from this description, not with `ai.c` open beside it. (Not legal advice.)

### Minimum pieces

| Piece | What it is | Size |
|---|---|---|
| Redacted view | `view(state, seat)` returning only what that seat may know. A pure reducer makes this a real boundary instead of Keldon's on-your-honour bits. | S if the engine already has hidden-information views, else M |
| Feature encoder | `encode(view, seat) -> Float32Array`: per-card-design presence for own hand and each public zone, thermometer-coded counters, relative-standing block, game clock. Input names array kept with the weights. | M (most design effort is here) |
| MLP inference | inputs -> 50-100 tanh -> softmax over players. Plain TypeScript loops over typed arrays; under 100 lines, a few thousand evaluations per second in a browser without any library. | S |
| Decision driver | For a prompt: list legal actions from the engine, apply each with the reducer on the immutable state, play forward to a fixed horizon (end of turn/round) with a cheap policy for every other prompt, evaluate, pick the best. | M |
| Hidden-outcome handling | Determinize: sample opponents' hidden cards and deck order from the cards the seat cannot see (seeded), average over K samples. Replaces Keldon's fake-card counters. | M |
| Opponent-choice predictor | Only if the game has simultaneous hidden choices. Second small net trained on the AI's own search results. | M, or zero if not needed |
| Self-play trainer | Node worker on the existing seeded simulation pool: play a game with the current weights, record (features, seat) per decision point, apply TD(lambda) backwards at game end, write weights. Needs backprop for one hidden layer (about 150 lines) or export states and train offline. | M |
| Weight file | JSON or binary: sizes, training count, input names (verify on load), two weight matrices. A 1,000 x 50 net is about 50k floats = 200 KB as Float32. | S |
| Evaluation harness | New weights vs previous weights and vs a scripted baseline over seeded games, to know whether training is improving. Keldon's repo has none; I would not skip it. | S-M |

### What depends on Race for the Galaxy

- **Simultaneous role selection** is the reason the role network exists, and the reason "enumerate opponent combos by probability" is the core of the turn. A game with alternating turns needs neither; a game with other simultaneous secret picks can reuse the idea directly.
- **One-round horizon works** because a round in RftG is a closed unit: after roles are revealed nearly everything is forced or locally optimisable, and a game is only about 7-12 rounds. A game with long turns, reaction windows or many sequential micro-decisions needs a different cut-off point and a rollout policy for the rest of the turn.
- **Small choice sets.** 7-15 roles; subsets of a hand under about 10 cards. Exhaustive bitmask enumeration is feasible. Larger action spaces need pruning or sampling.
- **"Cards are money."** The fake-card trick (count cards, ignore identities) is only sound because spent cards are interchangeable. Where a specific hidden card matters, use determinization.
- **Hand-made features** (`consume_ability`, clock, military) encode the designer's knowledge of RftG's engines. The equivalents for another game must be invented; a wider hidden layer can replace some of that, at the cost of more training games.
- **Score-margin target** fits a victory-point race. A co-operative or win/lose scenario game needs a different target (win probability, or scenario score).
- **Per-card inputs with one net per card set** fits a fixed pool of about 100-250 designs. With a data-driven card language there is an alternative: encode card properties (costs, types, effect tags) rather than identity, so new cards do not force retraining.

### What generalises

- Value net + shallow look-ahead using the real rules engine + TD(lambda) self-play (the TD-Gammon recipe).
- Thermometer coding of counts, seat-relative ordering (self first), "behind the leader" features.
- Storing each seat's state features at fixed points and training backwards from the final result with decaying weight.
- Pre-training on synthetic terminal states so early self-play games are not random.
- Target as softmax of final scores, and a tiny hand-written tie-breaker added to the net output.
- Caching evaluations by state hash within one decision; a pessimistic rather than mean estimate for own random draws.
- The choice log as the single answer channel (a reducer's action log already is this).

### Main risks

1. **Feature design is the project.** With 50 hidden units the net can only combine what the encoder hands it. Expect several encoder revisions, each forcing a retrain from scratch.
2. **Horizon mismatch.** If STCC's decisions do not resolve within a short, simulable unit, one-step look-ahead will play short-sightedly, and nested "AI answers its own sub-prompts" recursion can blow up in cost.
3. **Simulation throughput.** Keldon's training is about 25,000 games per configuration, each with thousands of forward passes and struct copies in C. A TypeScript reducer with immutable state is likely 10-100x slower per simulated step; measure games per hour on the pool before committing (a rough guess, not measured).
4. **Hidden information.** Determinization can make the AI play as if it will learn hidden cards later ("strategy fusion"); Keldon avoided the issue with faceless cards, which may not transfer.
5. **No exploration, single lineage.** Self-play can converge on a style that beats itself and loses to a human line it never met. Add an evaluation ladder and some move-selection noise early in training.
6. **Asymmetry and solo/co-op.** Keldon's method assumes symmetric competitive seats sharing one net. If STCC is solo, co-operative or scenario-driven, "opponent" modelling and the victory-share target must be redesigned; if the opposition is scripted by the rules, most of section 2's opponent machinery is unnecessary.
7. **Engine purity.** Keldon put about 90 `if (g->simulation)` branches in the rules. In a pure reducer, keep the engine untouched and put sampling and redaction in the AI layer; this is more work in the driver but protects the rules tests.
8. **Card pool changes** invalidate identity-based weights; plan the weight format and input naming so a mismatch is detected, as `load_net` does.

Overall size for a first working opponent on an existing reducer with a simulation pool: encoder M, net + file S, driver M, determinization M, trainer M, harness S-M; the role predictor only if the game needs it. The code is small (Keldon's whole AI is about 9,000 lines of C, most of it per-prompt glue); the cost is in feature iteration and training time.
