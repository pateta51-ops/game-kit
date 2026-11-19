# deck-motions

Cards fly from a pile to their places (deal, refill turn-over, deck cycle) and a pile riffles, anchored on piles found by `[data-pile="<id>"]` (the attribute card-pile draws). Uses motion-frame types for verb registration. `index.ts` is the pure timing (node); `ui.ts` the DOM.

- The game diffs its views and lists `Move`s: `{ id, dir: 'out' | 'in', pile, at, faceDown, refill?, far? }`. `at` is a pile id or `() => element` (where the card is drawn). `out`: pile to place; `in`: place to pile (a face-down card vanishes into it). `cycleMove(id, discard, deck)`: the top of the discard carried into the deck.
- `planDeal(moves, { speed, shuffled, departs })`: cards going in (90 ms apart, 520 ms each), then a riffle (2200 ms) for the `shuffled` piles that received one, then cards out in turn. Refills (`refill`) start together once the departing card landed (`departs`) plus 160 ms, lift 1.06, `far` flies 1.5x longer. Speed 0 or less: an empty plan.
- `dealFrom(moves, { speed, back, face, unit, shuffled, departs })`: lays stand-ins on `document.body` (call after the new view is rendered), plays them with Web Animations, returns `{ plan, done }`. `back(pile, rect)` is the game's card back (default an empty `div[data-pile-back]`), `face(id, el)` the face (default a clone of the place's element), `unit(pile)` the px unit the riffle's offsets follow (default `--u`, else 21.6, the 4K table); `axis` the turn-over: `'x'` side to side (default), `'y'` top to bottom; `direction` `1` a front flip (default), `-1` a back flip.
- K406 turn-over: a card leaving a face-down pile (or going face down into one) turns about its own axis with perspective: back and face fly one path, swap at edge-on and lift. `faceDown` unset = turn unless the pile has `data-face="up"`; a pile with `data-face="down"` (card-pile's `browse={false}`) always turns. Options `flipLift` (default the refill's lift, else `FLIP_LIFT` 1.08), `perspective` (`FLIP_PERSPECTIVE` 800 px), `flipStart`/`flipEnd` (share of the travel, `FLIP_START` 0.25, `FLIP_END` 0.75). `flipFrames(from, opts)` gives the pure keyframes.
- K443 intro spread (from STCC `gameStart.ts`): `dealFrom` options `dealMs`/`staggerMs` (flight and stagger at speed 1; defaults 520/90, STCC's opening uses 680/190; also `planDeal` opts) and `liftCurve(u)` (0..1 across the turn gives the share of `flipLift`; default a sine; STCC lifts 1.07 on a triangle, `u => 1 - Math.abs(2*u - 1)`). A `Move` may carry `from: { x, y, tilt, scale }` (px added to the pile-derived start, start rotation in degrees, a factor on the start scale: a heap-to-place flight from a tilt and 0.9) and `turn` (resting rotation in degrees). `flipFrames` `from` takes `rot` and `rest` the same way. All unset = unchanged; speed 0 still plays nothing.
- K445 resize box (STCC `lookFan.ts` fan entrance): `flipFrames(from, { box: { from, to } })` animates the copy's `left/top/width/height` (px) from a pile card's box to a different-size fan card's box, with `rotateY` only and no `perspective()` in the transform: the parent holds one fixed perspective, returned as `perspective` (default 4x the start height). Both sides share each box, the swap is exactly edge-on. Without `box` nothing changes.
- `riffle(deck, speed, opts)`, `shuffleDecks(piles, speed, opts)` (K396): the owner-approved riffle study (18 Nov 2026). `view: 'top'` (default) splits, riffles, bridges and squares a stack drawn on one canvas (WebGL2 strips, 2D canvas strips without WebGL2); `view: 'side'` tilts edge-on, riffles thumb-bent halves, bridges and tilts back (DOM strips). Options: `orientation` `'portrait' | 'landscape'` (default from the deck's shape), `cards` (default `RIFFLE_DECK_CARDS` 20), `durations` the four phases in ms at speed 1 (split or tilt in, riffle, bridge, square or tilt out; default `RIFFLE_PHASES_MS`, the study's `RIFFLE_STUDY_MS` 450/1350/750/450 scaled to `RIFFLE_MS` 2200 so `planDeal` still matches; `dealFrom` passes custom ones to `planDeal` as `riffleMs`), `topBack` the top view's back (a draw function `(ctx, w, h)` or an image; default `drawNeutralBack`), `back(pile, rect)` the side view's back element (default a clone of the top card). Speed is a time factor (2 = twice as long). The deck is hidden meanwhile and restored after; one riffle per deck at a time; a deck with no size, speed 0 or reduced motion: none. `riffleFrames` (the v2 keyframes, STCC D-428) stays exported but nothing plays it.
- `registerRiffle(verbs, { resolvePile?, back?, topBack?, view?, orientation?, cards?, durations?, shake? })` adds the
  `riffle` verb. The step's actor or zone id names the pile. By default it
  resolves via `[data-pile="<id>"]`. The riffle runs for the scaled step duration.
  With `natural: true` it uses the sum of `durations` (2200 ms by default), so give the step at least that much
  scaled time for the full riffle. Step end or skip restores the pile immediately.
  The player skips the verb at instant speed.
- Pass `shake: { degrees: 4, pixels: 3 }` for Imperium's smaller stack motion. A step may carry its own `shake` (`{ t, dur, actor, do: 'riffle', shake: {...} }`); the registration value is the default.
  It animates the pile's last child, or the pile itself when it has no children.
- None at speed 0, reduced motion or without Web Animations. `finishDeckMotions()` ends everything now; `finishOnInput()` does so on any press or key (call `finishDeckMotions` on undo and leaving the screen too).
- Not here: which cards move, the look, a market row slide. `market-row` keeps its own deal (`rowMotions`, same 520/90 timing): it is one flight from the deck element and needs no riffle or cycle; since K406 it turns its new cards over with `flipFrames`.
- Ported from STCC `8e6f55b` `dealing.ts`, from LordOfTheRings (BSD-3, `LICENSE-LordOfTheRings.txt`).

## Use it in 10 lines

```ts
import { cycleMove, flipFrames, planDeal, type Move } from '../kit/deck-motions/index'
import { dealFrom, finishOnInput } from '../kit/deck-motions/ui'

const moves: Move[] = [
  cycleMove('c9', 'p1.discard', 'p1.deck'),
  { id: 'c1', dir: 'out', pile: 'p1.deck', at: () => document.querySelector<HTMLElement>('[data-card-id=c1]'), faceDown: true },
]
console.log(planDeal(moves, { shuffled: ['p1.deck'] }).total)
finishOnInput()
void dealFrom(moves, { speed: 1, shuffled: ['p1.deck'], back: (pile) => Object.assign(document.createElement('div'), { className: `back ${pile}` }) }).done
const stop = new AbortController()
const fan = flipFrames({ x: 0, y: 0, sx: 1, sy: 1 }, { box: { from: { left: 0, top: 0, width: 80, height: 112 }, to: { left: 300, top: 40, width: 200, height: 280 } } })
console.log(fan.perspective)
void dealFrom([{ ...moves[1]!, from: { tilt: 9, scale: 0.9 }, turn: -3 }], { speed: 1, dealMs: 680, staggerMs: 190, liftCurve: (u) => 1 - Math.abs(2 * u - 1) }).done
void dealFrom(moves, { onCardStart: (index, id) => console.log('takes off', index, id), signal: stop.signal }).done
```

`onCardStart(index, id)` (K402): called when each card takes off, after its stagger delay at the speed in force (the plan's `delay`; `index` is its place in `moves`); under speed 0 or reduced motion every call fires at once, in order. `finishDeckMotions` fires the starts still waiting. `signal`: on abort the flight finishes at its end state and no further `onCardStart` is called.

```ts
import { createVerbs } from '../kit/motion-frame/player'
import { registerRiffle } from '../kit/deck-motions/ui'

const verbs = createVerbs()
registerRiffle(verbs)
```

```ts
import { drawNeutralBack, finishDeckMotions, riffle, shuffleDecks } from '../kit/deck-motions/ui'

const deck = document.querySelector<HTMLElement>('[data-pile="p1.deck"]')
const back = () => Object.assign(document.createElement('div'), { className: 'card-back' })
if (deck) {
  void riffle(deck, 1, { cards: 16, orientation: 'landscape', topBack: drawNeutralBack })
  finishDeckMotions()
  void riffle(deck, 1.5, { view: 'side', durations: [450, 1350, 750, 450], back })
}
void shuffleDecks(['p1.deck', 'p2.deck'], 0.5)
```
