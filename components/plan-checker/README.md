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
8. Give the plan the kit-reuse parts (K525; problems start with `kit:`), all inside the "Reuse map" section (`--reuse TEXT`): a reuse-map table (Layer, Kind, Source; Kind is Pull, Kit phase, Pattern, Port or New) with a line naming the pin (`tag vX.Y.Z`) so every Pull row's backticked names are checked against the kit's `components/` at that tag; a game sheet table (a header cell "Game sheet") with a row and an answer for each of the 22 game-sheet lines, each naming a backticked kit part or "build-own" unless it says "not in this game"; a build-own table (a header cell "What the game builds") with a row for every New, Port and Pattern map row, two phrasings searched, a verdict (kit phase, candidate, game code) and a K id, "steward not asked" or a reason of six words; a "Kit steward's reply (<date>)" line with a `>` block when any row has an answer; `plan-review/kit-fit.md` beside the plan naming every build-own row; and a backticked name or "build-own" in each Modifier order row. A plan written before 21 Nov 2026 passes `--kit-optional` (the same checks become NOTE lines, exit 0).
9. Read the `NOTE kit: Pull rows ...` line: it says whether the Pull rows were checked and against which tag. "NOT checked (no kit checkout)" means no folder holding `docs/PLAN.md`, `components/` and `kit.mjs` was found (`--kit PATH`, `$KIT_DIR`, the checkout holding the script); "tag ... not in" means `git fetch --tags` in that checkout.
10. Answer every line of the kit's mechanics map in the game sheet (K531). The map is `kit/recipes/mechanics.md` beside the plan's `docs/` folder (the pull copies it), or `--map PATH`. The sheet is one row per map line plus rows for what the map lacks (the 22 game-sheet lines and anything else the game has). A sheet row answers a map line when its first cell, up to its first comma, equals the line's first phrase (the Mechanic cell up to its first comma; case and spaces ignored), e.g. `| Roll dice | kit part | \`dice-tray\` |` for the line "roll dice, die, ...". **Failure** (one problem): map lines with no answering row, `kit: game sheet: N mechanics map line(s) unanswered: <first phrases>` and how to fix it; for a plan that has a game sheet this starts at the game's next pull of a kit carrying the map, until the sheet answers every line or the game's plancheck script passes `--sheet-optional`. **Warning:** a row answering "kit part" whose backticked parts the map line does not name; a plan with no game sheet table (one line). No map file: no check, a NOTE says so.
11. Read `WARN kit: build-own row ... names candidate K<n>, which the kit closed`: the candidate row your build-own table names is `state: done` in the kit (`--kit` checkout); use the part the warning names instead of building your own. A warning, never a failure.

**Common mistakes:**
- A plan older than 18 Nov 2026 fails the `depth:` checks until amended or run with `--depth-optional`.
- A plan older than 20 Nov 2026 fails the `cards:` checks until amended or run with `--cards-optional`.
- A plan older than 21 Nov 2026 fails the `kit:` checks until revised or run with `--kit-optional`.
- Naming a part by its title or a function name in a Pull row: only backticked folder names under `components/` count, and a backticked lower-case name outside parentheses that is no part at the pin is a problem (put file and function names in parentheses).
- Treating a "Pull rows NOT checked" NOTE as a pass: the Pull names were not compared with any tag.


## What it checks, how to run it

Run `python kit/plan-checker/plancheck.py docs/PLAN.md [flags]` (the game's check chain does); exit 0 when there is no problem, 1 with the problems listed. It reads only the Markdown; nothing is written.

- Always: balanced code fences; table-of-contents anchors name headings; `§N.N` references resolve; table rows have the header's column count; ```json blocks parse; each id (bolded or first cell of a table row) is defined once; every id a scenario cites is defined; every scenario is cited by a phase.
- Session plan: every phase appears in exactly one batch row, every batch names an existing phase and has a Model and a Confidence percentage; missing Worker, Touches, Gate or Owner columns are a note. `--sessions-optional` accepts a plan with no session plan.
- Experience features (XP-nn): each names a phase or Roadmap.
- Opt-in flags: `--cover TEXT` (every id of that section appears in the scenario catalogue; `--cover-rows`, `--cover-skip`), `--tsc` with `--types`, `--tsc-stub` and `--tsc-at DIR` (the plan's `ts` blocks compile under strict flags; `--tsc-at <folder>` compiles them in the game folder the plan's imports are written from so `../../kit/...` imports resolve), `--scenarios-end`; `--scenarios`, `--phases`, `--types`, `--sessions` rename the sections it looks for by heading keyword.
- Test depth (K414; every problem starts with `depth:`): the card-test section (heading "Card-language test programme", `--cards TEXT`) names `expectNotOffered` and has a table with columns Family, Full resolve, Poor setup in which every row has a full-resolve depth and names `expectNotOffered` or `expectNotFired`; the Definition of Done (`--done TEXT`) names `expectNotOffered`, "default-off" and "LLM playtest"; the test-layers section ("Layers", `--layers TEXT`) names "LLM playtest"; a phase block in the phases section names `llm-playtester`; the shared preamble names e2e and `heavy`. `--depth-optional` reports all of these as NOTE lines instead of problems.
- Card encoding (K492; every problem starts with `cards:`): the catalogue file exists, the plan names `ar-map.md`, the Modifier order table rows hold AR or IR ids, the card-test section names `cardCase` and "interaction", a Screen-text scan heading exists, the Definition of Done names `cards:check`, `cards:screen`, `cards:whole-game`, a phase names `cards:whole-game`, the session table has Clauses and Patterns columns within `--max-clauses` / `--max-patterns`, clause counts sum to the catalogue and every catalogue pattern is in a batch. `--cards-optional` reports all of these as NOTE lines.
- Kit reuse (K525; every problem starts with `kit:`), read from the "Reuse map" section (`--reuse TEXT`), tables inside code fences skipped: every reuse-map Kind is Pull, Kit phase, Pattern, Port or New; a Pull row names a kit part at the pinned tag (the pin: a line saying pin or tag with vX.Y.Z, else `kit/kit.lock.json`'s ref) or the part a Kit phase row builds, and no backticked name outside parentheses that is neither; a Kit phase row names a `Phase GK<n>` heading and a new one has a build-own row; the game sheet table has every line of the game sheet answered with a kit part or build-own; the build-own table has a row for every New, Port and Pattern map row and a "Game verbs" row when the game has an effect language, two phrasings searched, a verdict, a K id or "steward not asked" for kit phase and candidate, a reason of six words for game code, and a `Phase GK<n>` heading for a kit phase on K<n>; `plan-review/kit-fit.md` exists and names every build-own row; the steward's reply line has a `>` block under it; every Modifier order row names a backticked kit function or build-own. `--kit-optional` reports all of these as NOTE lines.
- Mechanics map (K531; problems start with `kit: game sheet:`): when the game sheet table exists and the map is found (`kit/recipes/mechanics.md` beside the docs folder, or `--map PATH`), every map line needs a sheet row (first cell up to its first comma equals the line's first phrase, case and spaces ignored). The missing lines are one failure (a NOTE with `--kit-optional`); `--sheet-optional` skips the check.
- Warnings, never failures: the kit pin is 5+ minor versions behind the latest tag, or a `Phase GK` targets a K row the kit marks done (`--kit PATH` names the checkout); a build-own row's candidate K row is `state: done` in the kit (names the part from `docs/mechanics.json`, else the row text); a "kit part" sheet answer the map line does not name; a plan with no game sheet when the map is found.

`--batch <id>` and `--section N.N` print and exit without checking. `--batch S4` prints the shared preamble, the batch's block, its phase blocks and the line ranges of the sections they list under "Read first"; a worker Reads only those ranges. `--section 5.3` prints one numbered section. `plancheck.ts` runs it from a test.

## Use it in 10 lines

```sh
python kit/plan-checker/plancheck.py docs/PLAN.md --batch S4   # a worker's order and the line ranges to read
python kit/plan-checker/plancheck.py docs/PLAN.md               # checks; the game sheet against kit/recipes/mechanics.md
python kit/plan-checker/plancheck.py docs/PLAN.md --sheet-optional   # a plan written before the mechanics map
```

## Breaking (K531)

A game whose plan has a game sheet table and whose pull brings `kit/recipes/mechanics.md` gets the mechanics-map check at that pull: until the sheet answers every map line it exits 1, or the game's plancheck script adds `--sheet-optional`. A plan with no sheet table only gets a WARN line.

## Breaking (K414)

A plan written before 18 Nov 2026 fails the `depth:` checks until its planner amends it, or until the game's plancheck script passes `--depth-optional` (the same plan then passes, with NOTE lines). The older checks give the same results as before. `plancheck.ts` only runs `plancheck.py`, so the two cannot differ; the tests run both on the same fixture plans and compare exit codes.

## Breaking (K492)

A plan without the cards sections fails the `cards:` checks until amended, or until the game's plancheck script passes `--cards-optional`. `plancheck.py` is now the build-plan skill's file of 20 Nov 2026, whole (the component's earlier copy had nothing the skill's lacked). `plancheck.ts` still only runs `plancheck.py`, so nothing was ported; the tests compare exit codes of both on the same plans.

## Breaking (K525)

`plancheck.py` adds the `kit:` checks (Pull names against the pinned tag, the game sheet table, the build-own table, `plan-review/kit-fit.md`). Every plan written before 21 Nov 2026 now exits 1. At its next pull a game adds `--kit-optional` to its `plancheck` script, until its plan is revised with a game sheet, a build-own table and a kit-fit review:

- `python kit/plan-checker/plancheck.py docs/PLAN.md ...` becomes `python kit/plan-checker/plancheck.py docs/PLAN.md ... --kit-optional`
- `node kit/plan-checker/plancheck.ts ...` becomes `node kit/plan-checker/plancheck.ts ... --kit-optional`
- `tsx kit/plan-checker/plancheck.ts` becomes `tsx kit/plan-checker/plancheck.ts --kit-optional`

`plancheck.ts` passes every argument on to `plancheck.py`, so it needs no change. `plancheck.py` is now the build-plan skill's file of 21 Nov 2026, whole; the component's earlier copy had nothing the skill's lacked (its kit-folder lookup is now `kit_dir()`, which also requires `components/` and `kit.mjs`).
