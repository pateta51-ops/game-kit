# llm-playtester: headless Claude playtests of whole games through a game adapter, to find bugs and keep legal wins as replay tests.
The game writes one adapter; Claude (or `--dummy`, the first option, no client built) picks one numbered option per step by a `choose` tool call (tool_choice auto, never forced: models that think refuse it; a reply without a tool call is re-asked once, then logged as a finding) `{option, reason}`. The system prompt is `rulesText()` plus `--docs` files, cached (`cache_control` ephemeral on the last block); each call sends only the current view, the options and the last 6 decisions, so cost per call stays flat.

## Rules for agents

**What it does:** Headless Claude playtests of a whole game through a game adapter.

**You must:**
1. Write one adapter (`GameAdapter`: `name`, `rulesText`, `start({seed, difficulty, scenario})`, `view`, `options`, `choose(i)` with `i` the 0-based index into `options()`, `done`, `replay`); `start` must reset all game state.
2. Try `--dummy` first: it builds no client and costs nothing.
3. Put the key in `.env.local` (or `--env <file>`) as `<GAME>_CLAUDE_API_KEY`, the adapter name in upper snake case. Never rely on the process environment, and never use `ANTHROPIC_API_KEY`: it is refused.
4. Install `@anthropic-ai/sdk` in the game before a paid run.
5. Always cap spend: `--max-usd` per run, and across invocations `--ledger <file> --total-cap <usd>` (`--require-cap` exits 2 without a cap).
6. Never run a paid run under `heavy run` or in a queued job: it waits on an API, not the CPU, and exits 2 when `HEAVY_HELD=1` is set (what the heavy queue sets for its jobs). `--dummy` is allowed.
7. Read `summary.md` in `logs/llm-player/<run-id>/`: `BUG:` reasons, invalid options and adapter throws are findings; keep legal wins as replay tests from `replay.json`.
8. A gate reads one line per run that ended with a result: `PLAYTEST ENDED <won|lost> after <n> turns` (printed through `log`, so it is one more log line per ended run; nothing like it when the run stopped on a cap or a finding). Grep for it; never parse `summary.md` for that.
9. A repeated finding is reported once: `BUG:` findings are keyed by their text lowercased, without the `step n:` prefix, whitespace collapsed, trailing punctuation dropped; digits are kept, so "option 2 offered illegally" and "option 5 offered illegally" stay two findings. `summary.md` shows `(xN)`, `PlaytestResult.findingCounts` is `{finding, count}[]` (`findings` stays the distinct texts). Behaviour change: a run now stops (`stop: 'finding'`, exit 1) at the third identical finding, so it does not keep spending on it; pass `maxRepeats` to change that (0 = never stop, the old behaviour).
10. Keep calls cheap (K741): the view is about half of every run's spend, so put long fixed text (full card texts, keyed by short name) in `reference()`, which goes once into the cached system prompt, and name things in `view()`; return a pick-several question as a `MultiSelect` and a points allocation as a `Split` (with `answer(values)`), never as a list of every combination; label options with a `group` instead of repeating it in each label. Behaviour change: a forced step (one option) is taken without a call (`auto: true` in `decisions.jsonl`), calls are sent with `output_config.effort` `low` unless `--effort medium|high` (`effort`), and the reason is asked for in at most 20 words.

**Common mistakes:**
- Two options with the same label (in one group) are shown (prompt and the `options` column of `decisions.jsonl`) as `label #2`, and counted once per run in `summary.md` (`- Duplicate option labels: n`); not a finding. Fix the labels.
- A multi-select or split that cannot be answered (fewer items than `min`, no targets, points outside the sum of the target limits) is an adapter finding before any call.
- An adapter that throws, or an invalid option after one retry, stops the run with a finding and exit 1.
- A reply cut off at `max_tokens` before its tool call is a finding: raise `--max-tokens` for thinking models.



`node kit/llm-playtester/playtest.ts --adapter <module> [--seed s] [--difficulty d] [--scenario s] [--model claude-opus-5-5|claude-sonnet-5-5|claude-haiku-5-5] [--max-usd 5] [--max-decisions 500] [--max-tokens 8000] [--runs n] [--docs a.md,b.md] [--env .env.local] [--dummy]`. The module exports `createAdapter()` or a default. The game needs `@anthropic-ai/sdk` for paid runs.

Key: `<GAME>_CLAUDE_API_KEY` (adapter name in upper snake case: `fakeGame` is `FAKE_GAME_CLAUDE_API_KEY`) from `.env.local` or `--env`, never from the environment. `ANTHROPIC_API_KEY` alone is refused (it would switch Claude Code to API billing). Each call is priced from its usage (cache reads and writes included; Haiku 5.5 has a higher rate for a prompt over 100,000 tokens, applied per request); a run stops before a call that could pass `--max-usd`. Before the first call it prints the worst-case cost per decision and the cap, and says so when one call alone would exceed the cap.

`maxTokens` (`--max-tokens`, default 8000 since K741 (largest reply seen in two real runs: 4,592 tokens), `MAX_TOKENS`) caps each reply, thinking included; a reply cut off before its tool call is a finding `reply cut off at max_tokens (n) before a choose tool call`.

Per run, `logs/llm-player/<run-id>/`: `decisions.jsonl` (step, view hash and start, options, choice, reason, usage, cost), `summary.md` (result, decisions, cost, findings: `BUG:` reasons, invalid options, adapter throws), `replay.json` (`adapter.replay()`). An invalid option is retried once with the error, then the run stops with a finding; an adapter throw stops it with a finding. Exit 1 when a run did not finish.

Optional total spend cap across invocations (all opt-in; without them nothing changes). `--ledger <file>` (env `PLAYTEST_LEDGER`): after every paid call one jsonl line `{runId, seed, costUsd, at}` is appended, so a run that throws still leaves its spend. `--total-cap <usd>` (env `PLAYTEST_TOTAL_CAP_USD`): what the ledger already holds is counted, and the runs get only what is left under it (per-run `--max-usd` still applies; nothing left: exit 1, no run). `--require-cap` (env `PLAYTEST_REQUIRE_CAP=1`): exit 2 when no total cap is set. `runMain(argv, log, env, client?)` returns `{code, runs, totalUsd, error?}` (`totalUsd` includes a run that threw); `main` returns its code and rethrows the error. `ledgerSpent(file)` sums a ledger.

```
PLAYTEST_REQUIRE_CAP=1 node kit/llm-playtester/playtest.ts --adapter src/llm.ts --ledger logs/spend.jsonl --total-cap 20 --runs 3
```

### Cheaper calls (K741)
`options()` may return, instead of a list of strings, items `{label, group?}` (printed under `[group]` headers), or one structured question:
- `{kind: 'multi', title?, min, max, items}`: one call lists the items once; the model answers `picks` (item numbers) in the same `choose` tool; the runner checks the count and that they are distinct and in range; then `answer(indices ascending)`.
- `{kind: 'split', title?, points, targets: [{label, group?, min?, max?}]}`: one call lists the targets once with their limits; the model answers `points` (one number per target); the runner checks each limit and the total; then `answer(points per target)`. One call per question, because every call resends the view (about 10,000 tokens in the measured runs), so asking item by item would cost one view per item.

An invalid answer is retried once with the error, then is a finding, as with plain options. A forced answer (one option, `min` equal to the item count, one target, points equal to the sum of the limits) makes no call.

`reference()` (optional) returns fixed text added as the last, cached system block after `rulesText()` and `--docs`; the tool and the whole system prompt sit before the one cache breakpoint, and only the view, the question, the options and the last 6 decisions are sent uncached. `--effort low|medium|high` (default low) is sent as `output_config.effort`; thinking stays adaptive (no budget is sent). Raise it when a run plays badly.

Measured on two real runs of one game before K741 (Sonnet, 213 calls, $8.50; Opus, 252 calls, $20.44): uncached input 52% / 54% (almost all the view: about 10,000 tokens a call, options and recent decisions under 1,000), cache reads 30% / 30% (a 120,000-token system prompt), output 15% / 13% (median 373 / 456 tokens, mostly thinking), cache writes 3.5% / 2.9% (one write per run: no gap over 5 minutes, so the 1-hour cache is not used). One-option steps were 3% of spend, lists over 20 options 2% / 4% (one list of 456). Expected after: about 10-15% less from the runner alone (no one-option calls, low effort, short reasons, short lists); a view that names cards held in `reference()` cuts the largest share, up to about 35% more.

## Use it in 10 lines

```ts
import { runPlaytest, type GameAdapter } from '../kit/llm-playtester/playtest.ts';
let total = 0;
const adapter: GameAdapter = {
  name: 'tiny', rulesText: () => 'Add 1 or 2; exactly 4 wins.', start: () => { total = 0; },
  view: () => `Total ${total}`, options: () => ['add 1', 'add 2'], choose: (i) => { total += i + 1; },
  done: () => (total < 4 ? null : { won: total === 4, summary: `total ${total}` }), replay: () => ({ total }),
};
const run = await runPlaytest(adapter, { seed: 'a', dummy: true }); // no dummy: Claude, key from .env.local
console.log(run.stop, run.decisions, run.costUsd, run.findings, run.dir);
```
