# prompt-host
Shows the engine's open question (an engine-core prompt) through a typed widget registry, with the common widgets built and unstyled. `index.ts` loads in node (`autoAnswer`); `ui.ts` is React.

## The game passes
- K289, `alone` options (engine-core K287): in `PickOptions` and `Order` an enabled alone option (Back, Pass) answers `[id]` on its click and never joins the selection or the order; prompts without `alone` are unchanged.

```tsx
const WIDGETS: Widgets<Prompt, PlayerView> = { pick: PickOptions, amount: (p) => <PickAmount {...p} start="last" />, order: Order, may: May, pay: PayCost, market: MarketPick };
<PromptHost widgets={WIDGETS} prompt={view.prompt} view={view} answer={(picks, id) => store.answer(picks, id)} seat={me}
  waiting={<p>…</p>} look={{ cls, label, text: ids.strip }} />
```
- `Widgets<P, V>`: one component per `P['kind']`; a missing kind (or an unknown one in a literal) fails to compile. Each gets `WidgetProps<PromptOf<P, K>, V>`: its own kind's prompt, the view, `answer(picks)` and `look`.
- `answer(picks, promptId)`: the host always sends the open prompt's id and drops a late answer from an older prompt; the store drops a stale id. `prompt` and `view` come from the player's own view, never the full state. `mine={false}`: the prompt is another seat's; `waiting` shows and no option does. K222: pass `seat` (this screen's seat) instead and the host compares it with `prompt.seat` (a prompt with no seat is everyone's); `mine` (a boolean) still wins when given, but is deprecated.
- Heading: `title(p)`, else the printed clause of `p.source` when a card asks (prompt-source); a rule's own source shows nothing. Words are the printed words; pass plain-text's `ids.strip` as `look.text` so rule ids in `why` and `idle` never show.
- `auto(p)`: picks to send without asking, once per prompt id; if that prompt is still open after it (refused), the widget shows. `autoAnswer(p, on, never?)` answers only engine-core `onlyOne` (one enabled option, min 1), never for the kinds in `never`. Widgets remount per prompt id, so half-made picks reset. With undo by step use the store helper below instead; `auto` is only for a game without undo.
- K226, forced answers from the store: `answerWithForced(game, history, action, content, forced, { seat })` sends the player's answer as a new undo step (engine-core `addStep`), then each forced answer (`forced(p)`, e.g. `(p) => autoAnswer(p, setting, NEVER)`) joined to it (`extendStep`), and stops at a prompt the player must answer or one of another seat. `seat` is required (`'all'`: every seat, hot seat). A chain still forced after `cap` (default 200) answers stops with `capped: true` and an `error`. One Undo takes back one click; the returned `events` (click and forced answers) go to paced-view `pushSteps` once. `sendForced(game, history, content, forced, { seat })` does the second half alone (the start of a game, the turn passing to this seat). Node, in `index.ts`.
## Widgets
- `PickOptions` (pick cards or options): toggles, count, Done when min..max; min = max = 1 answers on the click (`confirm` asks for Done).
- `PickAmount`: options are the amounts in order; a stepper from `start` (index or `'last'`), then Done; K305: `readout(option, prompt)` shows a preview of the current amount (class part `readout`).
- `Order`: click in order; a click on a numbered one takes it and those after back; when every legal option fits in max the rest follow the engine's order, else the clicks are the answer (min..max); Done.
- On the board (UFS tap to confirm): `useBoardPick(prompt, answer, { confirm? })` gives `marks` (option id: legal, barred, armed) for the board to highlight and `tap(id)` for it to call; the first tap arms, a second tap, Confirm or Enter answers, Cancel or Escape disarms (`confirm: false`: the first tap answers). K226: `max > 1` picks several: a tap toggles (all picked ones are `armed`, `picks` in tap order), Confirm or Enter answers once `ready` (min..max), `confirm: false` answers when max are picked; the bar then shows the count. `<BoardBar pick prompt look hint />` is the bar.
- `May` (yes / no), `PayCost` (one option per way to pay), `OptionList`: a click answers. `OptionButton`: the shared button. A barred option stays, shows `why` and never answers; a legal one with K91 `idle` shows its words as a warning.

## Look
Unstyled. `look.cls(part)` gives class names (default `kp-<part>`: host, title, option, mark, why, idle, count, done, cancel, pick, amount, less, more, value, readout, order, list, may, pay, board-bar). `look.label(o, p)` draws an option (words or a card face: `label: (o) => cardOf(o.id) ? <CardFace card={cardOf(o.id)} /> : <>{o.label}</>`, the face from card-parts, see [card-face-zoom.md](../../docs/recipes/card-face-zoom.md)); `count`, `done`, `less`, `more`, `confirm`, `cancel` are the game's words; K235: the defaults (label = the option id, English Done) are placeholders: the host warns once in dev, and `checkLook(look)` (node) lists them for a game's test, which expects `[]`. `aria-pressed` marks picks, `data-option` the option id, `data-kind` the prompt kind. K226: `data-picked` (picked-state: `picked` / `unpicked`, nothing before the first pick) and `data-shortcut` 1-9 (ui-helpers `bindPromptKeys`) on the option buttons. Recipe wiring every prompt part: [prompts.md](../../docs/recipes/prompts.md).
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
