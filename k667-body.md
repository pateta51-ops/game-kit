K667: card-harness `screenProblems`: `allowNumbers` patterns are removed from the shown words and from the clause text before any amount is read or compared, so a card-number reference is never taken as a printed amount. Without `allowNumbers` nothing changes. README rule 30 states it.

Failing test first (own commit 45616d77): `K667 a reference alone is not the amount` failed with received `[]` (false pass) before the fix.

Guarded lines, each checked by deleting it (a test fails):
- `numbers(noRef(words))` (shown words): "K667 a reference alone is not the amount"
- `numbers(noRef(text...))` for the wanted amounts: "K667 a reference in the printed text is no printed amount"
- the `g` flag added to `allowNumbers` patterns: "K667 every reference is removed, not only the first"

Real amount next to a reference ("pay 3 (card #9)", declared 2) still fails: tested.

Departures: the brief's "false no amount" did not reproduce; the bug found is the opposite, a reference whose digits equal the declared amount passed as the amount (false pass). A counted prompt's printed numbers are not stripped (the shown words already were, so no test could guard it).

Kit gap / Kit override: none. Check: GitHub's check on the head commit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
