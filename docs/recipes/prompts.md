# Show the engine's questions

Use when the engine asks the player something (`ctx.ask`) and the screen must show it. Component: `prompt-host` (README). The kit gives the registry and the common widgets, unstyled; the game gives the look and any widget of its own kind. See it wired in `components/reference-game` (pick, amount, may by clicks).

1. **One widget per prompt kind.** `Widgets<Prompt, PlayerView>` has a key for every `kind` of the game's prompt union; a missing or unknown kind fails to compile. Add a kind to the engine and the compiler lists the widget you owe.
2. **Host it** with the player's own view (never the full state):
   ```tsx
   const WIDGETS: Widgets<Prompt, PlayerView> = { pick: PickOptions, amount: (p) => <PickAmount {...p} start="last" />, order: Order, may: May, pay: PayCost, market: MarketPick };
   <PromptHost widgets={WIDGETS} prompt={view.prompt} view={view} answer={(picks, id) => store.answer(picks, id)} mine={view.prompt?.seat === me}
     waiting={<p>…</p>} auto={(p) => autoAnswer(p, settings.obvious, ['trade'])} look={{ cls, label, text: ids.strip }} />
   ```
3. **Style it.** Unstyled: `look.cls(part)` returns your class names (default `kp-<part>`), `look.label(o, p)` draws an option (words or a card face), and `count`, `done`, `less`, `more`, `confirm`, `cancel` are your words. Selectors: `aria-pressed` on picks, `data-option`, `data-kind`.
4. **Answered on the board** (tap a space, tap again to confirm): `useBoardPick(prompt, answer, { confirm? })` gives `marks` (option id to legal, barred, armed) for the board to highlight and `tap(id)` for it to call; draw `<BoardBar pick prompt look hint />`. The game draws the highlights from the option ids; the first tap arms, the second, Confirm or Enter answers, Cancel or Escape disarms.
5. **Forced prompts.** `autoAnswer(p, on, never?)` answers only an engine-core `onlyOne` prompt (one enabled option, min 1). Pass the kinds the player must always see in `never`. In node: `autoAnswer(p, true)` gives `['gold']`; with `['pay']` as `never` it gives `null`.

Pitfalls
- **The answer carries the prompt id.** `answer(picks, promptId)`: pass the id on to the store. The host drops a late answer from an older prompt and the store drops a stale id; an answer without the id is the stale-click bug.
- `mine={false}` for another seat's prompt: `waiting` shows and no option does. Never pass the full state; hidden information leaks through `view`.
- A barred option stays on screen with its `why` and never answers; do not filter it out.
- Words are the printed words: give plain-text's `ids.strip` as `look.text`, or rule ids in `why` and `idle` show.
- Widgets remount per prompt id, so half-made picks reset; keep nothing the player must keep inside a widget.
- If `auto` answers and the prompt is still open (refused), the widget shows; do not loop an auto answer yourself.

Proof: a jsdom test (`components/prompt-host/widgets.test.tsx` shows clicks answering each kind), an `autoAnswer` test in node, `npm run check`.
