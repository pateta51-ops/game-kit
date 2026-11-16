# Show the engine's questions

Use when the engine asks the player something (`ctx.ask`) and the screen must show it. Component: `prompt-host` (README). The kit gives the registry and the common widgets, unstyled; the game gives the look and any widget of its own kind. See it wired in `components/reference-game` (pick, amount, may by clicks; its store is the old loop, use step 5 and [game-store.md](game-store.md)). A card face as an option: [card-face-zoom.md](card-face-zoom.md).

1. **One widget per prompt kind.** `Widgets<Prompt, PlayerView>` has a key for every `kind` of the game's prompt union; a missing or unknown kind fails to compile. Add a kind to the engine and the compiler lists the widget you owe.
2. **Host it** with the player's own view (never the full state):
   ```tsx
   const WIDGETS: Widgets<Prompt, PlayerView> = { pick: PickOptions, amount: (p) => <PickAmount {...p} start="last" />, order: Order, may: May, pay: PayCost, market: MarketPick };
   <PromptHost widgets={WIDGETS} prompt={view.prompt} view={view} answer={(picks, id) => store.answer(picks, id)} seat={me}
     waiting={<p>…</p>} look={{ cls, label, text: ids.strip }} />
   ```
3. **Style it.** Unstyled: `look.cls(part)` returns your class names (default `kp-<part>`), `look.label(o, p)` draws an option (words or a card face), and `count`, `done`, `less`, `more`, `confirm`, `cancel` are your words. Selectors: `aria-pressed` on picks, `data-option`, `data-kind`.
4. **Answered on the board** (tap a space, tap again to confirm): `useBoardPick(prompt, answer, { confirm? })` gives `marks` (option id to legal, barred, armed) for the board to highlight and `tap(id)` for it to call; draw `<BoardBar pick prompt look hint />`. The game draws the highlights from the option ids; the first tap arms, the second, Confirm or Enter answers, Cancel or Escape disarms. A prompt with `max > 1` ("choose 2 spaces"): a tap toggles, every pick is `armed`, Confirm answers once `pick.ready`. Call the hook above both the board and the bar (in the screen, not in a widget), give the host's board kind a widget that draws only words or nothing, and pass `BoardBar` a full look (`{ ...defaultLook, ...yours }`). This is the one path for an engine prompt; phone-mode's `useCommitTap` / `useSecondTap` are for taps that are not a prompt's options (a dock, a menu).
5. **Forced prompts are answered by the store**, not the screen (owner, 16 Nov 2026; as 7th Inning Stretch's store does): the player's answer and every forced answer after it are one undo step and one paced queue.
   ```ts
   answer: (picks, id) => {
     const { history: h, steps, view } = get()
     if (h.state.prompt?.id !== id) return // a stale click
     const r = answerWithForced(RULES, h, { kind: 'answer', promptId: id, picks }, CONTENT, (p) => autoAnswer(p, settings.obvious, NEVER), { seat: me })
     if (r.ok) set({ history: r.history, steps: pushSteps(steps, view, r.events, isStep, settings.pace === 'instant') })
   },
   undo: () => { const r = undoStep(RULES, get().history, settings.undo, CONTENT); if (r.ok) set({ history: r.history, steps: noSteps() }) },
   ```
   `autoAnswer(p, on, never?)` answers only an engine-core `onlyOne` prompt (one enabled option, min 1); pass the kinds the player must always see in `never`. `answerWithForced` stops at the first prompt the player must answer or that belongs to another seat (`prompt.seat`; no seat is everyone's). At the start of the game, or when the turn reaches this seat, call `sendForced(RULES, h, CONTENT, forced, { seat: me })`. Leave the host's `auto` out: it sends through the click path, so each forced answer is its own undo step.
6. **The thin parts.** Each is small; this is where it plugs in.
   - **prompt-source**: put `source` (and `authority`) on the game's prompt in `ctx.ask`; the host's heading is the printed clause when a card asks. To show who decides, pass `title={(p) => <>{authorityNotice(p.authority, AUTHORITY)?.instruction}{p.source?.clause}</>}`. `stackView` feeds a "what is resolving" panel beside the host; `checkPromptSources` goes in a test.
   - **ghost-card**: in the widget of a kind whose options hang on cards, split with `ghostChoices(prompt.options, sourceOf, onBoard, snapshotOf)`; the options of a card that left play are drawn on its ghost face, each an `OptionButton` (so it keeps `why` and the stale-click guard).
   - **paced-view**: while steps play, show the folded view with no prompt (clear it in your fold), so the host shows nothing until the queue is empty; `questionZone` says where the host's band sits. Forced answers go in the same `pushSteps` call as the click (step 5).
   - **picked-state**: the option buttons carry `data-picked` (`picked` / `unpicked` after the first pick); import one `looks/*.css` or style `[data-picked]` yourself. On the board, spread `pickedAttrs(pick.picks.includes(id), pick.picks.length > 0)` on each space.
   - **bindPromptKeys** (ui-helpers): the first nine option buttons carry `data-shortcut`; bind once with `bindPromptKeys(document, { open: () => view.prompt !== null, panel: () => document.querySelector('[data-testid="prompt"]') })` and keys 1-9 press them. Enter and Escape on a board pick are `useBoardPick`'s.
   - ui-helpers `onlyForcedAnswer` and `createSelection` repeat `autoAnswer` and the widgets' own picks: use prompt-host's for an engine prompt.

Pitfalls
- **The answer carries the prompt id.** `answer(picks, promptId)`: pass the id on to the store. The host drops a late answer from an older prompt and the store drops a stale id; an answer without the id is the stale-click bug.
- `mine={false}` for another seat's prompt: `waiting` shows and no option does. Never pass the full state; hidden information leaks through `view`.
- A barred option stays on screen with its `why` and never answers; do not filter it out.
- Words are the printed words: give plain-text's `ids.strip` as `look.text`, or rule ids in `why` and `idle` show.
- Widgets remount per prompt id, so half-made picks reset; keep nothing the player must keep inside a widget.
- Forced answers through the host's `auto` are each their own undo step and are paced apart from the click: in a game with undo use `answerWithForced` (step 5).

Proof: a jsdom test (`components/prompt-host/widgets.test.tsx` shows clicks answering each kind), an `autoAnswer` test in node, `forced.test.ts` (forced answers sent once, one undo per click, none for the other seat), `npm run check`.
