# llm-playtester: headless Claude playtests of whole games through a game adapter, to find bugs and keep legal wins as replay tests.

The game writes one adapter; Claude (or `--dummy`, the first option, no client built) picks one numbered option per step by a `choose` tool call (tool_choice auto, never forced: models that think refuse it; a reply without a tool call is re-asked once, then logged as a finding) `{option, reason}`. The system prompt is `rulesText()` plus `--docs` files, cached (`cache_control` ephemeral on the last block); each call sends only the current view, the options and the last 6 decisions, so cost per call stays flat.

`node kit/llm-playtester/playtest.ts --adapter <module> [--seed s] [--difficulty d] [--scenario s] [--model claude-opus-5-5|claude-sonnet-5-5] [--max-usd 5] [--max-decisions 500] [--max-tokens 16000] [--runs n] [--docs a.md,b.md] [--env .env.local] [--dummy]`. The module exports `createAdapter()` or a default. The game needs `@anthropic-ai/sdk` for paid runs.

Key: `<GAME>_CLAUDE_API_KEY` (adapter name in upper snake case: `fakeGame` is `FAKE_GAME_CLAUDE_API_KEY`) from `.env.local` or `--env`, never from the environment. `ANTHROPIC_API_KEY` alone is refused (it would switch Claude Code to API billing). Each call is priced from its usage (cache reads and writes included); a run stops before a call that could pass `--max-usd`. Before the first call it prints the worst-case cost per decision and the cap, and says so when one call alone would exceed the cap.

`maxTokens` (`--max-tokens`, default 16000, `MAX_TOKENS`) caps each reply, thinking included; a reply cut off before its tool call is a finding `reply cut off at max_tokens (n) before a choose tool call`.

Per run, `logs/llm-player/<run-id>/`: `decisions.jsonl` (step, view hash and start, options, choice, reason, usage, cost), `summary.md` (result, decisions, cost, findings: `BUG:` reasons, invalid options, adapter throws), `replay.json` (`adapter.replay()`). An invalid option is retried once with the error, then the run stops with a finding; an adapter throw stops it with a finding. Exit 1 when a run did not finish.

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
