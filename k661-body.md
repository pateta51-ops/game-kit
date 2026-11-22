K661 card-harness: optional `clauseOf(x)` for `expectNotOffered` (options arg) and `expectNotFired` (5th arg). Used first, the top-level field match stays as fallback; without it nothing changes. README rule 32 and a recipe (run by `k661.test.ts`); tags, mechanics line, row file K661 (done), catalog regenerated.

Test first (own commit): with `{ t: 'resolved', source: 'c1', clause: 0 }`, `expectNotFired` passed though the clause fired; 4 of 6 tests failed (`AssertionError: expected [Function] to throw an error`) before the fix.

Guarded lines (each deleted, `k661.test.ts` fails): the `clauseOf` branch in `names` (3 fail), the `clauseOf` check in `offeredIn` (1 fail), passing `o.clauseOf` in `expectNotFired` (2 fail).

Departures: the tests use plain `Observed` objects, not the dice fake game (its events carry `card`, and an event shaped `source`/`clause` needs none of its engine).

Kit gap / override: none.

Checks: see GitHub's check on the head commit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
