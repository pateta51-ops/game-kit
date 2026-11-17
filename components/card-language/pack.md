# card-language: the standard verb pack (K232)

`cardPack<G, E extends PackEnv>(cfg)` returns `{ verbs, happen }`. Verbs written by two or more of STCC, Imperium, Rome, Unstoppable, Jarl and EBR, or needed by Radiance. Tests: `pack.test.ts` (one case per verb, a save in the middle of an effect, ordered answers, hidden picks, words).

## Wire it
- State: card-zones `zones` plus the optional `PackState` fields (`cardMoves`, `marks`, `later`, `res`; absent until used).
- Table: `const VERBS = { ...pack.verbs, ...mine }`; pass `table: () => VERBS` so nested effects validate and print with the game's verbs too. Task union: `VerbTask<Step, Env>`; handlers: `verb: verbHandler<G>(VERBS)` and `...timingHandlers(cfg)` with `happen: (ctx, o) => pack.happen(ctx, o) || mine(ctx, o)`.
- Env (`PackEnv`): `seat` (acting seat, required), `source` (the card), `cards` (chosen cards), `n` (the computed number). The game's env extends it.
- Zone names: `hand` means `hand:<seat>` when that zone exists, else the zone `hand`.

## Cards
- `cards`: `chosen` (env.cards), `source`, `top` (top `count` of `from`, read when the move happens), `pick` (the seat picks `count` in `from`, prompt kind `chooseCards`; a hidden card is offered as `#index`, a `filter` applies to seen cards only), `all` (of `from`).
- Amounts: a number or `'X'` (env.n, set by `count` and `chooseNumber`).
- A card that left `from` before its occurrence happens does not move.

## Verbs (fields; defaults)
| Verb | Fields | Defaults |
|---|---|---|
| draw, discard, mill, move, putIntoPlay, setAside, recall, gain, destroy, detach | `cards? count? from? filter? to? at?` | draw top deck>hand at bottom; discard pick hand>discard; mill top deck>discard; move top deck>discard; putIntoPlay pick hand>play; setAside source hand>aside; recall all aside>hand; gain pick market>discard; destroy pick play>discard; detach chosen>discard |
| attach | `cards? count? from? filter? host?` | source into zone `attached:<host>` (host: env.source, or `chosen` = env.cards[0]); the zone is made when needed |
| refill | `zone from size` | top of `from` to the bottom of `zone` until it holds `size` |
| shuffle | `zone` | `ctx.rng` only |
| search | `zone filter? count? to? shuffle?` | the seat sees the whole zone (prompt kind `search`, 0..count), takes to hand, then shuffles (`shuffle: false` keeps the order) |
| reveal, lookAt | `cards? count? from? filter? then?` | top of deck; reveal to all, lookAt to the acting seat only (card-zones `reveal`, seen through `viewOf`); `then` gets them as env.cards |
| scout | `from? count` | looks at the top `count`, prompt kind `orderCards` (first answered = top) |
| flip, exhaust, ready | `cards? count? from? filter?` | source; marks `flipped` (toggles), `exhausted`; read with `hasMark` |
| chooseCards | `zone min? max filter? then` | min = max, both capped at what is there; none there: no prompt, `then` gets [] |
| chooseOption | `options` (effects) | ids `0..`; one runs |
| may | `then` | ids `yes` / `no` |
| chooseNumber | `min? max then` | `then` gets env.n |
| chooseDestination | `cards? count? from? filter? to (zone list) at?` | source; ids are the zone names |
| choosePlayer | `others? then` | `cfg.seats`; `then` runs with that seat as env.seat; no seat to offer: `cfg.noPlayer(s, env)` gives the seat, default skip |
| choosePayment | `ways` (effects) `then` | a way not payable is barred (`why: cannotPay`) |
| orderEffects | `effects` | answer is the order run (min = max = all) |
| gainResource, pay, convert, adjust | `res amount`; `res amount`; `res amount into get`; `key by min? max?` | `cfg.res` or `state.res[seat][key]`; pay and convert refuse (do nothing) when not payable |
| seq, if, forEach, eachPlayer, repeat, count, later, payThen, custom | `steps`; `test then else?`; `then`; `then`; `times then`; `what then`; `at then`; `cost then`; `name n?` | `cfg.tests`, `cfg.counts`, `cfg.seats` (active seat first), `runLater(ctx, at)` at the game's moment, payThen only when every cost step is payable (resources; the cards a moving or marking step names exist, an exhausted card cannot be exhausted; nested; `cfg.custom[name].payable`), and `then` only when no cost occurrence was cancelled in its `would` window; choosePayment pays through payThen, `cfg.custom[name]` (`run`, `resume`, `text`) |

## Timing
Each moved card is one occurrence of a `would` batch: `kind` the verb (`chooseDestination`, `search`, `refill` and `attach` use their own name), `keys.player` the seat, `keys.target` the card (absent for a `top` move: the card is read when it happens), `keys.source` env.source. Prevention, replacement and before windows apply as for any batch; `cfg.moved(ctx, move)` is called after each card moved (log). `draw` from an empty deck: `cfg.reshuffle(s, deck, seat)` names the zone shuffled in, or undefined to stop (default stop); the reshuffle is its own occurrence (kind `reshuffle`), then the draw is tried once more (cancelled: the draw stops).

## Words
`PACK_WORDS` holds the default template per verb. Slots: any field (`{count}`), `{field:noun}` ("2 cards", `it` gives it/them), `{what}` (the cards), nested effects printed with the table. `cfg.words[op]`: the game's template or a function of the step (icon codes and numbers as printed). `cfg.word(kind, name)`: words for zone, resource, test, count and moment names.

## Prompts
Kinds: `chooseCards`, `search`, `orderCards`, `chooseOption`, `may`, `chooseNumber`, `chooseDestination`, `choosePlayer`, `choosePayment`, `orderEffects`, with `seat` = env.seat. `cfg.prompt(base, step, env)` turns them into the game's prompt.
