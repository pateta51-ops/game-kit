K663: card-harness `cardCasesIn` resolves a same-file string `const` for `printed`; anything else non-literal gets `<clause>: printed is not a literal or a same-file const: <name>`. New opt-in `mixed: true` (rule 11b): clauses with a `cardCase` are quote-checked, others are cited by an `it()` title. Default mode unchanged.

Tests first in their own commit (failing), then the fix. Recipe in the README is run by `k663.test.ts`.

Guarded lines (deleting each fails a test, checked locally):
1. `for (const c of text.matchAll(CONST)) consts.set(...)` in `cardCasesIn` (2 k663 tests fail)
2. `if (k.printedRef !== undefined) quoteDiffers.push(...)` in `inventory` (k663 and cardCase tests fail)
3. `|| (input.mixed === true && !quotes(c))` titleOnly term on the clause row (a k663 test fails)

Departures: one. `cardCase.test.ts` K487 assertion "printed: P" (an unresolvable name) now expects the new line `printed is not a literal or a same-file const: P` instead of "quote differs": intended new behaviour.

Post-build notes: performance none; implicit state none; kit candidates none.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
