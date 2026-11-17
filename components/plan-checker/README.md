# plan-checker

The plan checker: `plancheck.py` checks a game's build plan (Markdown) for balanced fences, anchors, section references, defined and cited ids, tables, session-plan and phase coverage. It also prints a worker's order (`--batch <id>`: the shared preamble, the batch block and the line ranges to read) or one numbered section (`--section 5.3`). `plancheck.ts` wraps it for tests. It warns (never fails) when the kit pin is 5+ minor versions behind the latest tag or a `Phase GK` targets a K row the kit's PLAN marks done (a major jump counts; `--kit PATH`; skipped when no checkout is found). The docstring at the top of `plancheck.py` lists every check and flag.

## What it checks, how to run it

Run `python kit/plan-checker/plancheck.py docs/PLAN.md [flags]` (the game's check chain does); exit 0 when there is no problem, 1 with the problems listed. It reads only the Markdown; nothing is written.

- Always: balanced code fences; table-of-contents anchors name headings; `§N.N` references resolve; table rows have the header's column count; ```json blocks parse; each id (bolded or first cell of a table row) is defined once; every id a scenario cites is defined; every scenario is cited by a phase.
- Session plan: every phase appears in exactly one batch row, every batch names an existing phase and has a Model and a Confidence percentage; missing Worker, Touches, Gate or Owner columns are a note. `--sessions-optional` accepts a plan with no session plan.
- Experience features (XP-nn): each names a phase or Roadmap.
- Opt-in flags: `--cover TEXT` (every id of that section appears in the scenario catalogue; `--cover-rows`, `--cover-skip`), `--tsc` with `--types`, `--tsc-stub` and `--tsc-at DIR` (the plan's `ts` blocks compile under strict flags; `--tsc-at <folder>` compiles them in the game folder the plan's imports are written from so `../../kit/...` imports resolve), `--scenarios-end`; `--scenarios`, `--phases`, `--types`, `--sessions` rename the sections it looks for by heading keyword.
- Warnings, never failures: the kit pin is 5+ minor versions behind the latest tag, or a `Phase GK` targets a K row the kit marks done (`--kit PATH` names the checkout).

`--batch <id>` and `--section N.N` print and exit without checking. `--batch S4` prints the shared preamble, the batch's block, its phase blocks and the line ranges of the sections they list under "Read first"; a worker Reads only those ranges. `--section 5.3` prints one numbered section. `plancheck.ts` runs it from a test.

## Use it in 10 lines

```sh
python kit/plan-checker/plancheck.py docs/PLAN.md --batch S4   # a worker's order and the line ranges to read
```
