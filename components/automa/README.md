An official solo automa that does not play by player rules: a seeded card deck kept as plain state data, a priority table of rules over the legal answers with fallbacks and declared tie-breaks, difficulty tiers as data, and an adapter to sim-pool's `Bot` (K272).

## Rules for agents

**What it does:** An official solo automa: a seeded card deck kept as plain data, a priority table of rules that picks among the legal answers, difficulty tiers, and an adapter to a sim-pool bot.

**You must:**
1. Keep the `AutomaDeck` in the game state and assign the deck that `drawAutoma` returns; the functions are pure and never mutate.
2. Pass the engine's `ctx.rng` to `newAutomaDeck` and `drawAutoma`, and a seeded rng (`rng.int`) to `decideAutoma`; never `Math.random`.
3. Call `decideAutoma` only with at least one legal answer; with none it throws `no legal answers`.
4. Write the table in order: the first rule whose `when` holds and whose `match` accepts an answer wins; add a table `tieBreak` (higher wins) and a `fallback` so ties and misses never end in luck you did not intend.
5. Put the revealed automa card in the bot's view, never the deck order.
6. Build difficulty with `atTier(base, tier)` from data; do not branch on the tier inside rules.
7. Wire the bot with `automaBot(name, automa)` into game-store `botOpponent` or sim-pool `botDriver`; use `automaLines(bot.last())` for logs and tests.

**Common mistakes:**
- Using it for an opponent that plays by player rules: use `opponent`.
- A table with no `fallback` (or one matching nothing): when no rule matches, any legal answer is chosen (rule `any`).
- Reading the deck in the view the bot sees: the bot then decides from hidden state.

- **Deck** (engine side, in the game state, so undo, saves and replays keep it): `newAutomaDeck(cards, ctx.rng, reshuffle = true)` → `AutomaDeck<C>` (`draw`, `discard`, `reshuffle`, `shuffles`). `drawAutoma(deck, ctx.rng)` → `{ card, deck }`: the drawn card goes to `discard`; an empty deck reshuffles the discard pile when `reshuffle` (counts `shuffles`), else `card` is null. Pure: assign the returned deck. Shuffles are named `automa` (engine-core `setRngOverrides`).
- **Priority table** `AutomaTable<V, A, K>`: `rules` in order, each `{ id, when?(view, knobs), match(answer, view, knobs), onMiss?: 'next' | 'fallback', tieBreak? }`; table `tieBreak` (criteria, higher wins) and `fallback?(answer, view, knobs)`. `decideAutoma(table, view, answers, knobs, rng)`: the first rule whose `when` holds and that matches a legal answer chooses; a rule that matches none is unavailable and goes to the next rule, or with `onMiss: 'fallback'` straight to the fallback; a fallback that matches nothing leaves every answer (rule `any`). Ties go through the criteria, then seeded random (`rng.int`). Never a dead end while there is an answer. Returns `AutomaDecision` (`answer`, `rule`, `missed`, `ties`, `random`); `automaLines(d)` for a log or a test.
- **Difficulty**: `Automa<C, V, A, K>` = `{ cards, reshuffle, table, knobs }`; `atTier(base, tier)` with `AutomaTier` `{ name, cards?(cards), table?(table), knobs?: Partial<K>, reshuffle? }`. The game supplies all of it.
- **Bot**: `automaBot(name, automa)` is a sim-pool `Bot<V, A>` (`choose`, `reasons`, `last()`): game-store `botOpponent(bot)`, sim-pool `botDriver(bot, view)`. The view must hold the revealed automa card (it is public once drawn), never the deck order.

Not here: an opponent that plays by player rules (`opponent`), trained play (`learned-opponent`). Recipe: `docs/recipes/automa.md`.

## Use it in 10 lines

```ts
import { automaBot, type Automa } from '../kit/automa/index'
import { DriverRng } from '../kit/sim-pool/index'

type View = { slots: number[]; card: { mode: 'big' | 'low' } | null }
const value = (a: string, v: View) => (a.startsWith('take:') ? (v.slots[Number(a.slice(5))] ?? 0) : 0)
const automa: Automa<{ mode: 'big' | 'low' }, View, string, { big: number }> = {
  cards: [{ mode: 'big' }, { mode: 'low' }], reshuffle: true, knobs: { big: 4 },
  table: { rules: [{ id: 'big', when: (v) => v.card?.mode === 'big', match: (a, v, k) => value(a, v) >= k.big }], tieBreak: [(a, v) => value(a, v)], fallback: (a) => a !== 'pass' },
}
const bot = automaBot('automa', automa) // game-store botOpponent(bot); sim-pool botDriver(bot, view)
console.log(bot.choose({ slots: [5, 2], card: { mode: 'big' } }, ['take:0', 'take:1', 'pass'], new DriverRng('s|automa|1')), bot.reasons?.())
```
