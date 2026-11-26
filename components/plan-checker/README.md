# plan-checker

The plan checker: `plancheck.py` checks a game's build plan (Markdown) for balanced fences, anchors, section references, defined and cited ids, tables, session-plan and phase coverage. It also prints a worker's order (`--batch <id>`: the shared preamble, the batch block and the line ranges to read) or one numbered section (`--section 5.3`). `plancheck.ts` wraps it for tests. It warns (never fails) when the kit pin is 5+ minor versions behind the latest tag or a `Phase GK` targets a K row the kit's PLAN marks done (a major jump counts; `--kit PATH` or `$KIT_DIR`; skipped when no checkout is found). With no kit checkout (a game's CI), the reuse map's Pull rows are checked against the game's locked copy `kit/` (K568). The docstring at the top of `plancheck.py` lists every check and flag.

## Rules for agents

**What it does:** Checks a game's build plan and prints a worker's order.

**You must:**
1. Run `python kit/plan-checker/plancheck.py docs/PLAN.md` in the game's check chain (Python 3 needed); exit 1 lists problems, nothing is written.
2. A worker prints its batch with `--batch <id>` and Reads only the line ranges it lists; `--section N.N` prints one section. Never open the plan whole.
3. Keep each id defined once, every cited scenario defined and every scenario cited by a phase.
4. Keep the session plan complete: every phase in one batch row, every batch with a Model and a Confidence percentage.
5. Keep the test-depth text in the plan (`expectNotOffered`, "default-off", "LLM playtest", `llm-playtester` in a phase, e2e and `heavy` in the preamble), or pass `--depth-optional` for an older plan. For an explicitly scoped non-card or no-LLM workflow, use the strict applicability profile below instead of a legacy optional flag.
6. Use `--sessions-optional` only for a plan with no session plan.
7. Give the plan the card-encoding parts (K492; problems start with `cards:`): `cards/catalogue.json` beside the plan (or `--catalogue PATH`; `{"summary":{"clauses":N},"patterns":[{"id":"P-01"}]}`), `ar-map.md` named, a "Modifier order" heading whose table rows each hold an AR-n or IR-n id, `cardCase` and "interaction" in the card-test section, a "Screen-text scan" heading, `cards:check`, `cards:screen` and `cards:whole-game` in the Definition of Done, a phase naming `cards:whole-game`, a session table with Clauses and Patterns columns (no batch over `--max-clauses`, default 40, or `--max-patterns`, default 10; the Clauses cells sum to the catalogue's `summary.clauses`; every catalogue pattern id in a Patterns cell). A plan written before 20 Nov 2026 passes `--cards-optional` (the same checks become NOTE lines).
8. Give the plan the kit-reuse parts (K525; problems start with `kit:`), all inside the "Reuse map" section (`--reuse TEXT`): a reuse-map table (Layer, Kind, Source; Kind is Pull, Kit phase, Pattern, Port or New) with a line naming the pin (`tag vX.Y.Z`) so every Pull row's backticked names are checked against the kit's `components/` at that tag; a game sheet table (a header cell "Game sheet") with one row and an answer for each of the sheet's 22 questions (step 10 lists them; always asked for, with or without the mechanics map), each naming a backticked kit part or "build-own" in its third cell unless the answer starts "not in this game"; a build-own table (a header cell "What the game builds") with a row for every New, Port and Pattern map row, two phrasings searched, a verdict (kit phase, candidate, game code) and a K id, "steward not asked" or a reason of six words; a build-own row of each kind the phases build (K690): a row starting "Screen" when a heading starts `Phase UC` or `Phase U<n>`, "Motion" for `Phase V` or `Phase V<n>`, "Sound" for `Phase AU` or `Phase AU<n>` (`Screen: <part>` and the like, checked like any other row; or one `Screen: none`, `Motion: none` or `Sound: none` row alone of its kind with a reason of six words; UW, UK and VO ask for none), failing as `kit: build-own table: the plan builds screen code (Phase U1) but has no 'Screen' row ...`; a "Kit steward's reply (<date>)" line with a `>` block when any row has an answer; `plan-review/kit-fit.md` beside the plan naming every build-own row; and a backticked name or "build-own" in each Modifier order row. A plan written before 21 Nov 2026 passes `--kit-optional` (the same checks become NOTE lines, exit 0).
9. Read the `NOTE kit: Pull rows ...` line: it says whether the Pull rows were checked and against which tag. A kit checkout is a folder holding `docs/PLAN.md`, `components/` and `kit.mjs`: `--kit PATH`, else `$KIT_DIR`, else the checkout holding the script, else `~/game-kit`. With none (a game's CI), the Pull rows are checked against the game's locked copy (K568): `kit/` beside the plan's `docs/` folder, or the folder holding the script, recognised by `kit.lock.json`; the NOTE then says "checked against the locked copy". Its kit parts are the lock's `components`, the folders in `kit/` holding `component.json`, and every component `kit/CATALOG.md` lists (`pull` copies the kit's whole catalogue at the tag, so a part not yet pulled still counts; with no `CATALOG.md` only the pulled parts count). The tag is the lock's `ref`; a plan pin naming another tag is a NOTE ("the plan pins ... but ... holds ...") and the rows are still checked. Not checked from the locked copy (it holds no row files or tags): closed candidates (step 11), the pin-age and done-row warnings; pass `--kit PATH` or set `$KIT_DIR` for those. "NOT checked (no kit checkout)" means neither a checkout nor a `kit/kit.lock.json` was found; "tag ... not in" means `git fetch --tags` in that checkout.
10. Answer the game sheet's 22 questions, one row each (K584): Who the player controls, What can run out, Clocks and tracks, The phase list, Where the opposition comes from, Dice, Positions, Numbers several cards change, Costs and payment, May an effect be offered, Lasting effects and status, Triggers and windows, Cards as data, Hidden information, Objectives and scoring, Set-up picks, Between games, Loading the content, Attacks and damage, Tokens and markers, Levels and upgrades, Markets and rows. A row answers a question when its first cell starts with the question's words (case and spaces ignored); several rows may start with the same question; other rows are allowed. **Failure:** a question with no row, `kit: game sheet: no row for the line '<question>'`. The kit's mechanics map (`kit/recipes/mechanics.md` beside the plan's `docs/` folder, which the pull copies, or `--map PATH`) prints its lines under those questions, one `## <question>` heading each: read the lines under a question before you answer it. The map's lines need no row of their own, so a new map line never fails a plan. **Warnings, never failures** (the map found, no `--sheet-optional`): a row answering "not in this game", or "build-own" with no backticked part, while the map has a built line under that question (a line whose answer is a part, whole or "partly", not pending), `WARN kit: game sheet line '<row>' answers build-own, and the mechanics map has built lines under that question: <first phrases>`; a row whose backticked parts no map line under its question names; a plan with no game sheet table (one line). No map file, or a map with no question headings (an older kit): no comparison, a NOTE says so. `--sheet-optional` skips the map (no warnings); the 22 rows are still asked for.
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
- Kit reuse (K525; every problem starts with `kit:`), read from the "Reuse map" section (`--reuse TEXT`), tables inside code fences skipped: every reuse-map Kind is Pull, Kit phase, Pattern, Port or New; a Pull row names a kit part at the pinned tag (the pin: a line saying pin or tag with vX.Y.Z, else `kit/kit.lock.json`'s ref) or the part a Kit phase row builds, and no backticked name outside parentheses that is neither; a Kit phase row names a `Phase GK<n>` heading and a new one has a build-own row; the game sheet table has every line of the game sheet answered with a kit part or build-own; the build-own table has a row for every New, Port and Pattern map row and a "Game verbs" row when the game has an effect language, two phrasings searched, a verdict, a K id or "steward not asked" for kit phase and candidate, a reason of six words for game code, and a `Phase GK<n>` heading for a kit phase on K<n>; a `Screen`, `Motion` or `Sound` row when a `Phase UC`/`U<n>`, `Phase V`/`V<n>` or `Phase AU`/`AU<n>` heading exists (K690; `<kind>: none` alone of its kind, with a reason of six words); `plan-review/kit-fit.md` exists and names every build-own row; the steward's reply line has a `>` block under it; every Modifier order row names a backticked kit function or build-own. `--kit-optional` reports all of these as NOTE lines.
- Mechanics map (K584): when the game sheet table exists and the map is found (`kit/recipes/mechanics.md` beside the docs folder, or `--map PATH`), each sheet row is compared with the map lines under its question. Nothing here fails: a "not in this game" or build-own answer over a built line and a kit part no line under the question names are WARN lines; `--sheet-optional` skips the comparison. The questions and their ids are written once, as `SHEET_QUESTIONS` in `plancheck.py`; the kit's gate and the map's generator read that list.
- Warnings, never failures: the kit pin is 5+ minor versions behind the latest tag, or a `Phase GK` targets a K row the kit marks done (`--kit PATH` names the checkout); a build-own row's candidate K row is `state: done` in the kit (names the part from `docs/mechanics.json`, else the row text); a sheet row answering build-own or "not in this game" over a built map line of its question; a sheet row naming a kit part no map line under its question names; a plan with no game sheet when the map is found.

`--batch <id>` and `--section N.N` print and exit without checking. `--batch S4` prints the shared preamble, the batch's block, its phase blocks and the line ranges of the sections they list under "Read first"; a worker Reads only those ranges. `--section 5.3` prints one numbered section. `plancheck.ts` runs it from a test.

## Use it in 10 lines

```sh
python kit/plan-checker/plancheck.py docs/PLAN.md --batch S4   # a worker's order and the line ranges to read
python kit/plan-checker/plancheck.py docs/PLAN.md               # checks; the game sheet's 22 questions, and warnings from kit/recipes/mechanics.md
python kit/plan-checker/plancheck.py docs/PLAN.md --sheet-optional   # the same checks without reading the mechanics map
python kit/plan-checker/plancheck.py docs/PLAN.md --kit ../game-kit  # a kit checkout (or $KIT_DIR): closed candidates and pin warnings too
```

## Strict applicability for non-card and no-LLM games

Pass `--applicability docs/check-applicability.json` to declare which specialized checks apply. Without this flag, all current defaults and legacy flags behave as before. The file must be a version 1 object with exactly `cards` and `llmPlaytest`; each has `mode: "required"` or `mode: "none"`. A `none` entry needs a nonblank `reason`. A reason on a `required` entry is optional but must also be nonblank. Missing keys, unknown keys or values, duplicate keys, malformed JSON and unreadable files fail with exit 1.

```json
{
  "version": 1,
  "cards": { "mode": "none", "reason": "This authored grid game has no card content or card effects." },
  "llmPlaytest": { "mode": "none", "reason": "The game uses a deterministic pilot and direct browser acceptance." }
}
```

```sh
python kit/plan-checker/plancheck.py docs/PLAN.md --applicability docs/check-applicability.json --cover Rules
node kit/plan-checker/plancheck.ts --plan docs/PLAN.md --applicability docs/check-applicability.json --cover Rules
```

`cards: none` excludes the card test programme and poor-setup helpers, catalogue/AR map/modifier order/screen-text requirements, card commands and card batch counts. `llmPlaytest: none` excludes only the LLM Definition of Done, Layers and phase requirements. The choices are independent: a card game can require card checks while excluding LLM playtesting, and a non-card game can require the LLM workflow.

The strict profile still requires ordinary structural and citation checks, phase and session assignments, the full reuse map and kit-fit review, `default-off` in Definition of Done, nonempty Layers, and `e2e` plus `heavy` in Shared preamble. Comments and code blocks cannot provide that evidence. It also requires a real inventory, even without `--cover`:

- `Rules` (or the heading selected by `--cover TEXT`) defines at least one rule using `- **MOVE-01** Rule text.` or a table whose first cell is that ID and following cells contain rule text. Use the existing numeric ID format, such as `MOVE-01` or `COU-007`.
- `Scenario catalogue` (or `--scenarios TEXT`) has a Markdown table with matching header and delimiter columns and at least one `SC-...` data row. The second cell cites defined rules or decisions; the third cell gives a nonblank expected outcome. Every rule in the inventory appears in a scenario's citation cell. Existing numeric ranges and family wildcards work. Each scenario ID is unique and assigned to an implementation phase, and each scenario a phase references must exist in the catalogue. Both directions use prose outside comments and fenced examples.
- `Implementation phases` has unique, visible `Phase <id>` headings, each assigned to a session. Assign a scenario within a phase block, including its subsections. Introductory prose, comments and fenced examples do not count.

Do not combine the profile with `--cards-optional`, `--depth-optional`, `--kit-optional`, `--sessions-optional`, `--sheet-optional`, `--cover-skip` or `--skip-without-python`; these combinations fail. `--section` and `--batch` are separate read commands and must not carry the profile: extraction is not validation.

Declared exclusions are checked against known evidence. `cards: none` fails if the plan still declares a card test programme, `cardCase`, `card-language` in its reuse map, card clause/pattern batch work or `cards:*` commands; the game sheet's `Cards as data` answer must start `not in this game`. It also inspects `package.json` beside the game's `docs/` directory for card scripts. Both the default `docs/cards/catalogue.json` and any `--catalogue` path are inspected when present: nonempty or malformed catalogues contradict the exclusion, so a missing alternate path cannot hide an existing catalogue. An empty catalogue is allowed but never required. `llmPlaytest: none` fails if phases declare `llm-playtester`, Layers declare an LLM playtest, or package scripts declare an LLM playtest command. Malformed package declarations fail. Static checks inspect the conventional files and these declarations; they do not discover all arbitrary code or execute the declared acceptance commands.

For original game-code build-own rows, record the actual searches and a reason of at least six words. Add `; steward not asked` when no steward reply was obtained; these marker words do not count toward the reason. When every build-own row has that marker, the existing checker does not require a fabricated steward reply block. The kit-fit file still has to name every build-own row. A `Pull rows NOT checked` note remains a limitation of the existing source lookup, not evidence that the pin was verified.

## Breaking (K690)

A plan whose phases build screen, motion or sound code (a heading `Phase UC`, `Phase U<n>`, `Phase V`, `Phase V<n>`, `Phase AU` or `Phase AU<n>`) fails with `kit: build-own table: the plan builds <kind> code (<phase>) but has no '<Kind>' row ...` until its build-own table has a row starting `Screen`, `Motion` or `Sound` for each kind (one per part the game writes, `Screen: <part>`, or `Screen: none` with a reason of six words when every part is a kit part with the game's data and skin), or until the game's plancheck script passes `--kit-optional`. A plan with none of those headings gives the same result as before.

## Breaking (K584)

The game sheet is one row per question (22) whether or not the mechanics map is found. Since K567 a sheet checked against the map was not asked for the 22 questions, only for a row per map line: such a sheet now fails with `kit: game sheet: no row for the line '<question>'` for each question it lacks, until those rows are added (its map-line rows may stay) or the game's plancheck script passes `--kit-optional`. Gone as a failure: `kit: game sheet: N mechanics map line(s) unanswered` (K531, K567); no message replaces it. `--sheet-optional` and `--kit-optional` are accepted as before.

## Breaking (K531, replaced by K584)

From K531 to K584 a plan with a game sheet table and a map had to answer every map line. That failure is gone.

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
