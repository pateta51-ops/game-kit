# Pattern: visual replay

Engine-core already holds `replay()` and the command-line replay (K2). The viewer is welded to its game's screens and art: pattern only, L if ever shared (SELECTION.md, "Presentation").

## Example (read, never edit)
rome `rome-fate-of-an-empire-fan-prototype` @ `1d0fd2e` (C:\projects\rome-fate-of-an-empire-fan-prototype):
- `src/ui/motion/replays.ts`: recordings to steps.
- `src/ui/motion/replayStage.ts`: stage over the real board (game-bound).
- `docs/ui/motion/replays.json`: `{ records, clips }`.
- Gaps: `docs/ui/motion/RULES-BRIEF.md` (the recording rules) and rome's replay lab page were not read; only the inputs and the stage head.

## Idea
Every view is re-derived from the seed and the actions. Never patch a view or an engine state to make a clip: the engine state is the truth, the animation is a function of two states.

## Data (`replays.json`)
- `records`: `key -> { options (full GameOptions, seed included), actions[] }`. One recording per scenario worth showing.
- `clips`: `clipId -> [ [recordKey, at], ... ]`. A clip is a list of steps; `at` is an index relative to the end of the record (`actions.length + at`), so a clip keeps pointing at the same moment when a recording changes length.

## Rebuild (`recordedClip(id, content)`, cached in a `Map`)
For each step: `createGame(options, content)`, then `applyAction` for each action in order; a refused action throws with the recording key and answer index (a stale recording fails loudly). At the target index keep `{ before, after, events, from, to, ms }`, where `from` and `to` are `getPlayerView(state, content, seat)` of the two states and `events` are the events of that action. Duration `ms` is data per clip or step, not derived.

## Stage (game-bound)
Reads real DOM anchors (`getBoundingClientRect` centre and size) of the source and target cells, interpolates boxes with a smoothstep ease (`p*p*(3-2p)`, clamped), waits for fonts and image decode before the first frame, and throws when an anchor is missing or hidden (a hidden anchor means the layout changed under the clip). Captions and corrections are tables keyed by clip and step.

## Kit version, if ever built
The game supplies `createGame`, `applyAction`, `getPlayerView`, the screen to mount and the anchors by selector. The kit supplies the records/clips schema and loader, the rebuild loop with its error text, the cache and a timing runner with an injected clock.

## Pitfalls
- Record with a driver at a fixed seed; re-record only on a deliberate rules change.
- Never import art or screens into the shared part.
