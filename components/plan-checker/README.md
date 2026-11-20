# plan-checker

The plan checker: `plancheck.py` checks a game's build plan (Markdown) for balanced fences, anchors, section references, defined and cited ids, tables, session-plan and phase coverage. It also prints a worker's order (`--batch <id>`: the shared preamble, the batch block and the line ranges to read) or one numbered section (`--section 5.3`). `plancheck.ts` wraps it for tests. It warns (never fails) when the kit pin is 5+ minor versions behind the latest tag or a `Phase GK` targets a K row the kit's PLAN marks done (a major jump counts; `--kit PATH`; skipped when no checkout is found). The docstring at the top of `plancheck.py` lists every check and flag.

## Rules for agents

**What it does:** Checks a game's build plan and prints a worker's order.

**You must:**
1. Run `python kit/plan-checker/plancheck.py docs/PLAN.md` in the game's check chain (Python 3 needed); exit 1 lists problems, nothing is written.
2. A worker prints its batch with `--batch <id>` and Reads only the line ranges it lists; `--section N.N` prints one section. Never open the plan whole.
3. Keep each id defined once, every cited scenario defined and every scenario cited by a phase.
4. Keep the session plan complete: every phase in one batch row, every batch with a Model and a Confidence percentage.
5. Keep the test-depth text in the plan (`expectNotOffered`, "default-off", "LLM playtest", `llm-playtester` in a phase, e2e and `heavy` in the preamble), or pass `--depth-optional` for an older plan.
6. Use `--sessions-optional` only for a plan with no session plan.
7. Give the plan the card-encoding parts (K492; problems start with `cards:`): `cards/catalogue.json` beside the plan (or `--catalogue PATH`; `{"summary":{"clauses":N},"patterns":[{"id":"P-01"}]}`), `ar-map.md` named, a "Modifier order" heading whose table rows each hold an AR-n or IR-n id, `cardCase` and "interaction" in the card-test section, a "Screen-text scan" heading, `cards:check`, `cards:screen` and `cards:whole-game` in the Definition of Done, a phase naming `cards:whole-game`, a session table with Clauses and Patterns columns (no batch over `--max-clauses`, default 40, or `--max-patterns`, default 10; the Clauses cells sum to the catalogue's `summary.clauses`; every catalogue pattern id in a Patterns cell). A plan written before 20 Nov 2026 passes `--cards-optional` (the same checks become NOTE lines).

**Common mistakes:**
- A plan older than 18 Nov 2026 fails the `depth:` checks until amended or run with `--depth-optional`.
- A plan older than 20 Nov 2026 fails the `cards:` checks until amended or run with `--cards-optional`.


## What it checks, how to run it

Run `python kit/plan-checker/plancheck.py docs/PLAN.md [flags]` (the game's check chain does); exit 0 when there is no problem, 1 with the problems listed. It reads only the Markdown; nothing is written.

- Always: balanced code fences; table-of-contents anchors name headings; `§N.N` references resolve; table rows have the header's column count; ```json blocks parse; each id (bolded or first cell of a table row) is defined once; every id a scenario cites is defined; every scenario is cited by a phase.
- Session plan: every phase appears in exactly one batch row, every batch names an existing phase and has a Model and a Confidence percentage; missing Worker, Touches, Gate or Owner columns are a note. `--sessions-optional` accepts a plan with no session plan.
- Experience features (XP-nn): each names a phase or Roadmap.
- Opt-in flags: `--cover TEXT` (every id of that section appears in the scenario catalogue; `--cover-rows`, `--cover-skip`), `--tsc` with `--types`, `--tsc-stub` and `--tsc-at DIR` (the plan's `ts` blocks compile under strict flags; `--tsc-at <folder>` compiles them in the game folder the plan's imports are written from so `../../kit/...` imports resolve), `--scenarios-end`; `--scenarios`, `--phases`, `--types`, `--sessions` rename the sections it looks for by heading keyword.
- Test depth (K414; every problem starts with `depth:`): the card-test section (heading "Card-language test programme", `--cards TEXT`) names `expectNotOffered` and has a table with columns Family, Full resolve, Poor setup in which every row has a full-resolve depth and names `expectNotOffered` or `expectNotFired`; the Definition of Done (`--done TEXT`) names `expectNotOffered`, "default-off" and "LLM playtest"; the test-layers section ("Layers", `--layers TEXT`) names "LLM playtest"; a phase block in the phases section names `llm-playtester`; the shared preamble names e2e and `heavy`. `--depth-optional` reports all of these as NOTE lines instead of problems.
- Card encoding (K492; every problem starts with `cards:`): the catalogue file exists, the plan names `ar-map.md`, the Modifier order table rows hold AR or IR ids, the card-test section names `cardCase` and "interaction", a Screen-text scan heading exists, the Definition of Done names `cards:check`, `cards:screen`, `cards:whole-game`, a phase names `cards:whole-game`, the session table has Clauses and Patterns columns within `--max-clauses` / `--max-patterns`, clause counts sum to the catalogue and every catalogue pattern is in a batch. `--cards-optional` reports all of these as NOTE lines.
- Warnings, never failures: the kit pin is 5+ minor versions behind the latest tag, or a `Phase GK` targets a K row the kit marks done (`--kit PATH` names the checkout).

`--batch <id>` and `--section N.N` print and exit without checking. `--batch S4` prints the shared preamble, the batch's block, its phase blocks and the line ranges of the sections they list under "Read first"; a worker Reads only those ranges. `--section 5.3` prints one numbered section. `plancheck.ts` runs it from a test.

## Use it in 10 lines

```sh
python kit/plan-checker/plancheck.py docs/PLAN.md --batch S4   # a worker's order and the line ranges to read
```

## Breaking (K414)

A plan written before 18 Nov 2026 fails the `depth:` checks until its planner amends it, or until the game's plancheck script passes `--depth-optional` (the same plan then passes, with NOTE lines). The older checks give the same results as before. `plancheck.ts` only runs `plancheck.py`, so the two cannot differ; the tests run both on the same fixture plans and compare exit codes.

## Breaking (K492)

A plan without the cards sections fails the `cards:` checks until amended, or until the game's plancheck script passes `--cards-optional`. `plancheck.py` is now the build-plan skill's file of 20 Nov 2026, whole (the component's earlier copy had nothing the skill's lacked). `plancheck.ts` still only runs `plancheck.py`, so nothing was ported; the tests compare exit codes of both on the same plans.
