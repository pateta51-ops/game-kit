# prompt-source

Each prompt names its source frame (card and clause), a decision-authority tag when the player decides for the automated side, and a read-only stack view. No packages; draws nothing; no prose. Tests: `source.test.ts`. Idea from marvel-champions-digital-game (K90).

## The game passes

The game adds `source: PromptSource` and `authority?: string` to its own prompt type (engine-core's `G['prompt']` extends `KernelPrompt`, so engine-core is unchanged) and fills them in `ctx.ask`:

```ts
ctx.ask({ options, min: 1, max: 1, authority: 'firstPlayerTargets',
  source: { frame: 'f12', card: 'c-104', clause: 'Response: After you defend, deal 1 damage.', window: 'after', event: 'defend' } });
```

- `PromptSource` = `{ frame, card?, clause, window?, event? }`. `clause`: the printed words, or the rule id when a rule asks (`card` absent). `window`: 'before' (interrupt, about to happen) or 'after' (response, just happened); `event` in the game's terms.
- `AuthorityTable`: tag to `{ instruction, rule }`, constant words kept beside the game's prompt type. `authorityNotice(tag, table)` gives the entry, or null for 'player', no tag or an unknown tag.
- `stackView(stack, describe, openFrame?)`: rows of a LIFO stack (the last entry runs first), next to resolve first, each the game's row data plus `frame`, `depth` (0 next) and `open` (the frame of the open prompt). `describe(task, index)` returns `{ frame, ...data }` or null to leave an internal task out. For a "what is resolving" panel and a prompt header.
- `checkPromptSources({ states, prompt, frames?, authorities? })`: over seeded states, a line per open prompt with no source, an empty clause, a source frame not among `frames(state)`, or an authority tag missing from `authorities`. Put `expect(checkPromptSources(spec)).toEqual([])` in a test.

Sources and rows are data; the words on screen come from the game's text (rule ids never on screen).

## Use it in 10 lines

```ts
import { checkPromptSources } from '../kit/prompt-source/index'

type S = { prompt: { source?: { frame: string; clause: string } } | null }
const problems = checkPromptSources<S>({
  states: [{ id: 'start', state: { prompt: { source: { frame: 'f1', clause: 'c1' } } } }],
  prompt: (s) => s.prompt,
})
console.log(problems) // [] when every open prompt names its source
```
