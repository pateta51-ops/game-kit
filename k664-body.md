K664: card-harness `patternProblems`: `wording` keeps the whole-pattern shape check, and split patterns compare their wording groups. Without `wording` nothing changes.

Failing test first: commit "K664: failing tests ..." (`k664.test.ts`; 2 of 3 failed before the fix: `wording: true` dropped `P-01 has 2 shapes`, and a split pattern reported nothing for same wording with different shapes).

Guarded lines (each deleted/loosened in turn, the card-harness tests failed every time, checked):
1. `if (!shapes.has(s)) shapes.set(s, c.id);` (always fill the whole-pattern map, also with `wording`)
2. `if (shapes.size > 1 && row?.split !== true)` (split skips the whole-pattern check)
3. `for (const [k, g] of groups) if (g.size > 1)` (wording groups reported also for split)

Departures: the brief's rule changes what `wording: true` accepts, so K509 tests that expected a pattern with several wordings and several shapes to pass now say otherwise. In `k509.test.ts`, wording-only assertions filter to the ` wording ` lines (`pw`), the split case passes `split` without `wording`, and the `cardsCheckMain` exit-0 case uses a `split` AR-map row. No test was removed. A pattern holding several shapes by wording now needs `split` (README rule 33).

Kit gap: none. Kit override: none.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
