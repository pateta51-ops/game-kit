# prompt-host
Shows the engine's open question (an engine-core prompt) through a typed widget registry, with the common widgets built and unstyled. `index.ts` loads in node (`autoAnswer`); `ui.ts` is React.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `useBoardPick`: board pick confirmation that yields keyboard input to dialogs
<!-- /hooks -->

`autoAnswer` never answers a lone option marked `unseen` (engine-core `onlyOne`, K641): the player is shown the prompt.

**What it does:** Shows the engine's open question through a typed widget registry.

**You must:**
1. Give `Widgets` one component for every prompt `kind`; a missing kind fails to compile.
2. Pass `prompt` and `view` from the player's own view, and `seat` (this screen's seat) so another seat's prompt shows `waiting`. With `game-store`, forward only answers that carry a prompt ID. Pass that same ID to `store.answer(picks, id)` so the store can reject a stale click. See the [checked game-store example](../game-store/README.md#use-it-in-10-lines) when your game also installs game-store.
3. Supply `look` with `cls`, `label`, the game's words (`done`, `count`, `confirm`, `cancel`, ...) and `text: ids.strip`; keep a game test `checkLook(look)` equal to `[]` (placeholders warn in dev).
4. For forced answers use the store helper `answerWithForced(game, history, action, content, forced, { seat })` (`seat` required; `'all'` for hot seat), then feed its `events` to paced-view `pushSteps` once. `auto` is only for a game without undo.
5. Board taps: `useBoardPick` and `<BoardBar>`; map `marks` onto the board elements and call `tap(id)`.
6. Import opt-in look CSS (`looks/overflow.css`, `legal-glow.css`) yourself; pass `overflow` with `stage` and `zone` in the same coordinates.
7. Show printed words: the heading is the card's printed clause (prompt-source), never a rule id.
8. Read the picks of `PickOptions` through `onChange(picked)` (and pass `picked` to control it); never read them from the DOM.
9. `useBoardPick` pauses Enter/Escape while a visible, non-inert dialog or alertdialog is open. For a custom overlay pass `overlay: '<selector>'`, or `paused: () => boolean` for another keyboard owner. Typing, modifiers, repeated or already-handled keys do not answer or clear board picks; a focused button keeps its own Enter.

**Common mistakes:**
- A chain of forced answers beyond `cap` stops with `capped: true` and an `error`.
- Half-made picks reset when the prompt id changes; do not keep them elsewhere.


## The game passes
- K289, `alone` options (engine-core K287): in `PickOptions` and `Order` an enabled alone option (Back, Pass) answers `[id]` on its click and never joins the selection or the order; prompts without `alone` are unchanged.

- `Widgets<P, V>`: one component per `P['kind']`; a missing kind (or an unknown one in a literal) fails to compile. Each gets `WidgetProps<PromptOf<P, K>, V>`: its own kind's prompt, the view, `answer(picks)` and `look`.
- `answer(picks, promptId)`: the host always sends the open prompt's id and drops a late answer from an older prompt; the store drops a stale id. `prompt` and `view` come from the player's own view, never the full state. `mine={false}`: the prompt is another seat's; `waiting` shows and no option does. K222: pass `seat` (this screen's seat) instead and the host compares it with `prompt.seat` (a prompt with no seat is everyone's); `mine` (a boolean) still wins when given, but is deprecated.
- Heading: `title(p)`, else the printed clause of `p.source` when a card asks (prompt-source); a rule's own source shows nothing. Words are the printed words; pass plain-text's `ids.strip` as `look.text` so rule ids in `why` and `idle` never show.
- `auto(p)`: picks to send without asking, once per prompt id; if that prompt is still open after it (refused), the widget shows. `autoAnswer(p, on, never?)` answers only engine-core `onlyOne` (one enabled option, min 1), never for the kinds in `never`. Widgets remount per prompt id, so half-made picks reset. With undo by step use the store helper below instead; `auto` is only for a game without undo.
- K226, forced answers from the store: `answerWithForced(game, history, action, content, forced, { seat })` sends the player's answer as a new undo step (engine-core `addStep`), then each forced answer (`forced(p)`, e.g. `(p) => autoAnswer(p, setting, NEVER)`) joined to it (`extendStep`), and stops at a prompt the player must answer or one of another seat. `seat` is required (`'all'`: every seat, hot seat). A chain still forced after `cap` (default 200) answers stops with `capped: true` and an `error`. One Undo takes back one click; the returned `events` (click and forced answers) go to paced-view `pushSteps` once. `sendForced(game, history, content, forced, { seat })` does the second half alone (the start of a game, the turn passing to this seat). Node, in `index.ts`.
## Widgets
- `PickOptions` (pick cards or options): toggles, count, Done when min..max; min = max = 1 answers on the click (`confirm` asks for Done); K408: at max (above 1) every unpicked option renders disabled (`aria-disabled`), enabled again when a pick is undone. K457: `onChange(picked)` fires with the picked ids on every pick and unpick; the optional `picked` prop makes the selection controlled (the widget then changes it only through `onChange`; leave it out for the default, own state). A game needing the "all N picked" state uses these, never the DOM.
- `PickAmount`: options are the amounts in order; a stepper from `start` (index or `'last'`), then Done; K305: `readout(option, prompt)` shows a preview of the current amount (class part `readout`). K522: `hideDone` leaves out the widget's own Done so a game's own Confirm (e.g. a prompt band) can submit; `onChange(picked)` then gives `[amountId]` (or `[]` when that amount is barred) on mount and at every step, and the game's Confirm calls `answer(picked)`. Without `hideDone` it renders and answers as before.
- `Order`: click in order; a click on a numbered one takes it and those after back; when every legal option fits in max the rest follow the engine's order, else the clicks are the answer (min..max); Done.
- On the board (UFS tap to confirm): `useBoardPick(prompt, answer, { confirm?, overlay?, paused? })` gives `marks` (option id: legal, barred, armed) for the board to highlight and `tap(id)` for it to call; the first tap arms, a second tap, Confirm or Enter answers, Cancel or Escape disarms (`confirm: false`: the first tap answers). Keyboard input yields to active overlays, editable targets and focused controls; closed always-mounted dialogs do not block it. K226: `max > 1` picks several: a tap toggles (all picked ones are `armed`, `picks` in tap order), Confirm or Enter answers once `ready` (min..max), `confirm: false` answers when max are picked; the bar then shows the count. `<BoardBar pick prompt look hint />` is the bar.
- `May` (yes / no), `PayCost` (one option per way to pay), `OptionList`: a click answers. `OptionButton`: the shared button. A barred option stays, shows `why` and never answers; a legal one with K91 `idle` shows its words as a warning.

## Look
Unstyled. `look.cls(part)` gives class names (default `kp-<part>`: host, title, option, mark, why, idle, count, done, cancel, pick, amount, less, more, value, readout, order, list, may, pay, board-bar). `look.label(o, p)` draws an option (words or a card face: `label: (o) => cardOf(o.id) ? <CardFace card={cardOf(o.id)} /> : <>{o.label}</>`, the face from card-parts, see [card-face-zoom.md](../../docs/recipes/card-face-zoom.md)); `count`, `done`, `less`, `more`, `confirm`, `cancel` are the game's words; K235: the defaults (label = the option id, English Done) are placeholders: the host warns once in dev, and `checkLook(look)` (node) lists them for a game's test, which expects `[]`. `aria-pressed` marks picks, `data-option` the option id, `data-kind` the prompt kind. K226: `data-picked` (picked-state: `picked` / `unpicked`, nothing before the first pick) and `data-shortcut` 1-9 (ui-helpers `bindPromptKeys`) on the option buttons. Recipe wiring every prompt part: [prompts.md](../../docs/recipes/prompts.md).
## Overflow (K388)

Give the host its normal fixed size inside a positioned zone. The hook tries the normal layout, shrinks the answer container by one CSS pixel at a time down to `floor`, then tries two columns. If they still overflow, it opens a scrolling panel downward. The cap is `frac * stage[1]` and the panel stops `gap` pixels (12 by default) before an overlapping keep-out. Pass `stage` as `[width, height]` and the zone and keep-outs as `[x, y, width, height]` in the same stage coordinates.

```tsx
import { PickOptions, PromptHost } from '../kit/prompt-host/ui'

type Pick = { id: number; kind: 'pick'; min: number; max: number; options: { id: string; enabled: boolean }[] }

export function AskWithOverflow({ prompt, send }: { prompt: Pick | null; send: (picks: readonly string[], id?: number) => void }) {
  return (
    <PromptHost
      widgets={{ pick: PickOptions }}
      prompt={prompt}
      view={null}
      answer={send}
      look={{ label: (o) => o.id, done: 'Done' }}
      overflow={{ floor: 28, frac: 0.5, stage: [960, 600], zone: [40, 80, 480, 140], keepOut: [[40, 380, 480, 160]] }}
    />
  )
}
```

Import `looks/overflow.css` for the two-column grid and sticky default `.kp-board-bar`. Make answer controls inherit the container font size. With custom widgets, mark the answers container with `data-prompt-answers` or pass its selector as `overflow.answers`. Use `useOverflow({ ref, answers, floor, frac, stage, zone, keepOut }, deps)` for your own host, or replace `ref` with `find: () => element`. Include the prompt identity and layout changes in `deps`. The hook also refits when descendants are added or removed. PromptHost handles prompt changes and refits when the overflow options object changes.

A panel stops only before keep-outs that overlap the zone horizontally and end below its top. The host carries `data-overflow="cols"` for two columns in the zone, or `data-overflow="panel"` for the expanded panel. In either mode, `data-overflow-answers` marks the measured container. Scrolling hosts expose `data-more="1"` while more content lies below and `data-more="0"` at the end.

Row mode (K442): when the answers container is a flex row, the hook first sets `flex-wrap: wrap` (font untouched). If it still overflows the zone, the host carries `data-overflow="rows"` and scrolls inside the zone: no panel, no font shrink. Vertical lists are unchanged. Pass `rows: false` in the overflow options to opt out: a flex row then shrinks and uses columns or the panel like a list.

## Use it in 10 lines
```ts
import { autoAnswer } from '../kit/prompt-host/index'

const p = { id: 4, kind: 'pay', min: 1, max: 1, options: [{ id: 'gold', enabled: true }, { id: 'strife', enabled: false }] }
console.log(autoAnswer(p, true)) // ['gold']: the only legal answer, sent without asking
console.log(autoAnswer(p, true, ['pay'])) // null: the game always asks this kind
```

```tsx
import { PickOptions, PromptHost, type Widgets } from '../kit/prompt-host/ui'

type P = { id: number; kind: 'pick'; min: number; max: number; options: { id: string; enabled: boolean }[] }
const W: Widgets<P, null> = { pick: PickOptions }
export const Ask = ({ prompt, send }: { prompt: P | null; send: (picks: readonly string[], id?: number) => void }) => <PromptHost widgets={W} prompt={prompt} view={null} answer={send} look={{ label: (o) => o.id.toUpperCase(), done: 'Fertig' }} />
```

Look file (opt-in): `looks/legal-glow.css`, a box-shadow glow on `[data-mark="legal"]` (touch included, no filter); variables `--focus`, `--glow`. Or `looks/imperium-legal.css` (K309): Imperium's three-layer gold bloom on the same marks, sized by `--pick-edge-size`; variables `--pick-glow-core`, `--pick-glow`, `--pick-glow-far`; pair it with picked-state `looks/imperium.css` for the chosen card.
