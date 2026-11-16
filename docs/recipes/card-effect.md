# Add a card-language effect and test it on real cards

Pattern: [docs/patterns/card-language.md](../patterns/card-language.md). The card language is the game's; the kit supplies the test tools.

0. **Starter.** The verb table is `card-language`: one row per `op` with `fields` (checks), `run` (handler) and `text` (the card's words from the same step). Copy `components/card-language/template/verbs.ts` and `verbs.test.ts`; spread `{ verb: verbHandler<G>(VERBS) }` into `handlers`; push `ctx.then(...effectTasks(card.effect, env))`. `components/reference-game` shows it running.
1. **A new effect is a new row in the verb table**, not a new union kind or handler: `fields`, `run`, `text`, and an example. `expectVerbs(VERBS, examples)` fails when a verb has no handler, text or example; `validateEffect(VERBS, steps)` checks card data and refuses unknown verbs and keys. Card text and ids come from the transcription via `card-patches`; the source is never edited.
2. **In `run`:** mutate the draft only through `own(...)` (copy on write). Ask with `ctx.ask`, queue follow-ups with `ctx.then`; randomness through `ctx.rng` only.
3. **If it happens to someone or something** (damage, draw, move), do it through `would(...)` batches so prevention, replacement and triggers apply: [timing.md](timing.md).
4. **Strict grammar** comes with the table (`validateEffect`, and `card-harness` `strictProblems`); nothing to register by hand.
5. **Test on a real card** with `card-harness`:
   ```ts
   const sc = new Scenario(GAME).set((s) => void (s.gold = 3))
   const [id] = sc.put('hand', 'real-card-key')
   sc.run({ kind: 'play', card: id as string })
   expect(sc.s.gold).toBe(4)          // state
   expect(sc.events.map((e) => e.type)).toEqual(['gained'])
   ```
   Title the test with the rule id (`traceability` fails otherwise). `sc.options()` / `sc.answer(...)` for prompts; `sc.cast('kind')` narrows the open prompt.
6. **Coverage.** `runInventory` lists each piece of the language and fails when a piece or printed clause has no test citing it. `describeCheck` proves the generated reading equals the printed text word for word. `roundTripCards` proves every card state survives JSON.
7. **Zoomed card text** is the full transcription (words, icons, tokens, glossary links), so add the clause to `glossary` coverage when it introduces a term.

Proof: the card's test, `runInventory` clean, `traceability` clean.
