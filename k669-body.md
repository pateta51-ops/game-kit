K669: card-harness `describeCheck` options (opt-in) and reading order.

- `describeCheck(..., known?, options?)`: `raw: { allow }` reports a camelCase word, snake_case or dotted key, `AB-12` or `x#1` id, empty bracket and a stand-in number such as 99 in a generated reading; `accepted: { line: reason }` drops listed lines and fails a stale or reasonless entry; `tokensOnly` compares only icon codes and numbers. No options: nothing changes (tested).
- `parseReadingFiles(texts)`: readings files parsed in recorded order (by the `PR #n` in each, stable), so the last line of a clause is the newest. README rule 37.
- Not breaking: `parseReadings` and `readingProblems` are unchanged and `parseReadingFiles` is new. A game that read its readings files in directory order and has an older PR number sorting after a newer one would get a different result only by switching to the new function.

Red first: commit ec2bee4e holds only `k669.test.ts`; against main's `checks.ts`/`cardsCheck.ts` it fails 13 of 17 (the 4 that pass are the no-option and no-change cases). Mutation check on the three guarded lines (each deleted, 1 test fails, restored): the stand-in-number push in `rawProblems`; the `stale` accepted-line list; the PR-number sort in `parseReadingFiles`.

Departures: the brief says `parseReadings` applies readings in recorded order; it parses one text, so the order lives in the new `parseReadingFiles` (the only place order can differ), and `parseReadings` is untouched. The raw-word shapes (snake_case, dotted, `AB-12`, `x#1`) are my reading of "flag or rule key"; a game's own key shapes beyond these are not caught.

Kit gap: none. Kit override: none. Rules questions: none. `tsc` shows one error, `@anthropic-ai/sdk` missing in `llm-playtester`, unrelated and present on main; GitHub's check is the proof.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
