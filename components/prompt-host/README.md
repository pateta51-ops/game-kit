# prompt-host
Shows the engine's open question (an engine-core prompt) through a typed widget registry, with the common widgets built and unstyled. `index.ts` loads in node (`autoAnswer`); `ui.ts` is React.

## The game passes
```tsx
const WIDGETS: Widgets<Prompt, PlayerView> = { pick: PickOptions, amount: (p) => <PickAmount {...p} start="last" />, order: Order, may: May, pay: PayCost, market: MarketPick };
<PromptHost widgets={WIDGETS} prompt={view.prompt} view={view} answer={(picks, id) => store.answer(picks, id)} mine={view.prompt?.seat === me}
  waiting={<p>…</p>} auto={(p) => autoAnswer(p, settings.obvious, ['trade'])} look={{ cls, label, text: ids.strip }} />
```
- `Widgets<P, V>`: one component per `P['kind']`; a missing kind (or an unknown one in a literal) fails to compile. Each gets `WidgetProps<PromptOf<P, K>, V>`: its own kind's prompt, the view, `answer(picks)` and `look`.
- `answer(picks, promptId)`: the host always sends the open prompt's id and drops a late answer from an older prompt; the store drops a stale id. `prompt` and `view` come from the player's own view, never the full state. `mine={false}`: the prompt is another seat's; `waiting` shows and no option does.
- Heading: `title(p)`, else the printed clause of `p.source` when a card asks (prompt-source); a rule's own source shows nothing. Words are the printed words; pass plain-text's `ids.strip` as `look.text` so rule ids in `why` and `idle` never show.
- `auto(p)`: picks to send without asking, once per prompt id; if that prompt is still open after it (refused), the widget shows. `autoAnswer(p, on, never?)` answers only engine-core `onlyOne` (one enabled option, min 1), never for the kinds in `never`. Widgets remount per prompt id, so half-made picks reset.
## Widgets
- `PickOptions` (pick cards or options): toggles, count, Done when min..max; min = max = 1 answers on the click (`confirm` asks for Done).
- `PickAmount`: options are the amounts in order; a stepper from `start` (index or `'last'`), then Done.
- `Order`: click in order; a click on a numbered one takes it and those after back; when every legal option fits in max the rest follow the engine's order, else the clicks are the answer (min..max); Done.
- On the board (UFS tap to confirm): `useBoardPick(prompt, answer, { confirm? })` gives `marks` (option id: legal, barred, armed) for the board to highlight and `tap(id)` for it to call; the first tap arms, a second tap, Confirm or Enter answers, Cancel or Escape disarms (`confirm: false`: the first tap answers). `<BoardBar pick prompt look hint />` is the bar.
- `May` (yes / no), `PayCost` (one option per way to pay), `OptionList`: a click answers. `OptionButton`: the shared button. A barred option stays, shows `why` and never answers; a legal one with K91 `idle` shows its words as a warning.

## Look
Unstyled. `look.cls(part)` gives class names (default `kp-<part>`: host, title, option, mark, why, idle, count, done, cancel, pick, amount, less, more, value, order, list, may, pay, board-bar). `look.label(o, p)` draws an option (words or a card face); `count`, `done`, `less`, `more`, `confirm`, `cancel` are the game's words. `aria-pressed` marks picks, `data-option` the option id, `data-kind` the prompt kind.
## Use it in 10 lines
```ts
import { autoAnswer } from '../kit/prompt-host/index'

const p = { id: 4, kind: 'pay', min: 1, max: 1, options: [{ id: 'gold', enabled: true }, { id: 'strife', enabled: false }] }
console.log(autoAnswer(p, true)) // ['gold']: the only legal answer, sent without asking
console.log(autoAnswer(p, true, ['pay'])) // null: the game always asks this kind
```
