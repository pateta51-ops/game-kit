# deck-motions

Cards fly from a pile to their places (deal, refill turn-over, deck cycle) and a pile riffles, anchored on piles found by `[data-pile="<id>"]` (the attribute card-pile draws). Uses motion-frame types for verb registration. `index.ts` is the pure timing (node); `ui.ts` the DOM.

- The game diffs its views and lists `Move`s: `{ id, dir: 'out' | 'in', pile, at, faceDown, refill?, far? }`. `at` is a pile id or `() => element` (where the card is drawn). `out`: pile to place; `in`: place to pile (a face-down card vanishes into it). `cycleMove(id, discard, deck)`: the top of the discard carried into the deck.
- `planDeal(moves, { speed, shuffled, departs })`: cards going in (90 ms apart, 520 ms each), then a riffle (2200 ms) for the `shuffled` piles that received one, then cards out in turn. Refills (`refill`) start together once the departing card landed (`departs`) plus 160 ms, lift 1.06, `far` flies 1.5x longer. Speed 0 or less: an empty plan.
- `dealFrom(moves, { speed, back, face, unit, shuffled, departs })`: lays stand-ins on `document.body` (call after the new view is rendered), plays them with Web Animations, returns `{ plan, done }`. `back(pile, rect)` is the game's card back (default an empty `div[data-pile-back]`), `face(id, el)` the face (default a clone of the place's element), `unit(pile)` the px unit the riffle's offsets follow (default `--u`, else 21.6, the 4K table); `axis` the turn-over: `'x'` side to side (default), `'y'` top to bottom; `direction` `1` a front flip (default), `-1` a back flip.
- `riffle(deck, speed, opts)`, `shuffleDecks(piles, speed, opts)`: the owner-approved shuffle v2 (STCC D-428: 12 cards, halves a card width apart, zigzag drops, square-up, tap), constants and keyframes unchanged; the deck is hidden meanwhile; one riffle per deck at a time.
- `registerRiffle(verbs, { resolvePile?, back?, unit?, shake? })` adds the
  `riffle` verb. The step's actor or zone id names the pile. By default it
  resolves via `[data-pile="<id>"]`. The riffle runs for the scaled step duration.
  With `natural: true` it uses 2200 ms, so give the step at least that much
  scaled time for the full riffle. Step end or skip restores the pile immediately.
  The player skips the verb at instant speed.
- Pass `shake: { degrees: 4, pixels: 3 }` for Imperium's smaller stack motion.
  It animates the pile's last child, or the pile itself when it has no children.
- None at speed 0, reduced motion or without Web Animations. `finishDeckMotions()` ends everything now; `finishOnInput()` does so on any press or key (call `finishDeckMotions` on undo and leaving the screen too).
- Not here: which cards move, the look, a market row slide. `market-row` keeps its own deal (`rowMotions`, same 520/90 timing): it is one flight from the deck element and needs no riffle, cycle or turn-over; use `dealFrom` beside it only for a refill that turns over.
- Ported from STCC `8e6f55b` `dealing.ts`, from LordOfTheRings (BSD-3, `LICENSE-LordOfTheRings.txt`).

## Use it in 10 lines

```ts
import { cycleMove, planDeal, type Move } from '../kit/deck-motions/index'
import { dealFrom, finishOnInput } from '../kit/deck-motions/ui'

const moves: Move[] = [
  cycleMove('c9', 'p1.discard', 'p1.deck'),
  { id: 'c1', dir: 'out', pile: 'p1.deck', at: () => document.querySelector<HTMLElement>('[data-card-id=c1]'), faceDown: true },
]
console.log(planDeal(moves, { shuffled: ['p1.deck'] }).total)
finishOnInput()
void dealFrom(moves, { speed: 1, shuffled: ['p1.deck'], back: (pile) => Object.assign(document.createElement('div'), { className: `back ${pile}` }) }).done
```

```ts
import { createVerbs } from '../kit/motion-frame/player'
import { registerRiffle } from '../kit/deck-motions/ui'

const verbs = createVerbs()
registerRiffle(verbs)
```
