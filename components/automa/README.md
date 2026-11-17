An official solo automa that does not play by player rules: a seeded card deck kept as plain state data, a priority table of rules over the legal answers with fallbacks and declared tie-breaks, difficulty tiers as data, and an adapter to sim-pool's `Bot` (K272).

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
