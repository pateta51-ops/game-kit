# plan-checker

The plan checker: `plancheck.py` checks a game's build plan (Markdown) for balanced fences, anchors, section references, defined and cited ids, tables, session-plan and phase coverage. It also prints a worker's order (`--batch <id>`: the shared preamble, the batch block and the line ranges to read) or one numbered section (`--section 5.3`). `plancheck.ts` wraps it for tests. It warns (never fails) when the kit pin is 5+ minor versions behind the latest tag or a `Phase GK` targets a K row the kit's PLAN marks done (a major jump counts; `--kit PATH`; skipped when no checkout is found). The docstring at the top of `plancheck.py` lists every check and flag.

## Use it in 10 lines

```sh
python kit/plan-checker/plancheck.py docs/PLAN.md --batch S4   # a worker's order and the line ranges to read
```
