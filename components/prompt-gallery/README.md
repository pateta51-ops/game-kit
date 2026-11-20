# prompt-gallery
One game state per prompt kind and per ending, a check that fails when a kind has none, and a dev route that shows each on the game's own components. `index.ts` loads in node (scripts, tests); `ui.ts` is the React route.

## Rules for agents

**What it does:** gives each engine prompt kind and each ending one stored game state, fails a test when a kind has none, and shows each on the game's own components in a dev-only route.

**You must:**
1. Build a `GallerySpec` from the engine's own list of prompt kinds (`prompts`) and result kinds (`endings`), with one `fixtures` entry per kind (`group`, `kind`, `state`), and `kindOf` to read the kind back from a state.
2. Store ids and actions in a fixture (replay them), not card text, and return the state (it may be a promise).
3. Put `expect(checkGallery(spec)).toEqual([])` in a test: a new kind then fails until it has a fixture. Run `checkStates` too: it reports fixtures that throw, are slow, or no longer show their kind.
4. Mount `Gallery` on a dev route and show it only when `isDevMode(undefined, import.meta.env.DEV)` is true.
5. Render each fixture with the game's own prompt and ending components in `render`; give `check` so answers are validated and not played.
6. Where the game has screen controls, run `checkActionCoverage` over seeded states to find legal actions no control sends.

**Common mistakes:**
- An empty `prompts` list: it is a finding.
- A fixture of a kind not in the list, or two for one kind: findings.
- Fixtures left stale after an engine change: `checkStates` with `kindOf` reports a state that no longer shows its kind; harvest again.
- Opening the route in a production build: `isDevMode` is false unless the game passes the dev flag.

## The game passes
```ts
const spec: GallerySpec<State> = {
  prompts: PROMPT_KINDS,            // every kind of the engine's prompt type; an empty list is a finding
  endings: ['won', 'lost'],         // every result kind; may be empty or one (some games have one ending)
  fixtures: [{ group: 'prompt', kind: 'pickCard', state: () => replay(stored.pickCard), note: 'seed a-3' }],
  kindOf: (s, group) => (group === 'prompt' ? (s.prompt?.kind ?? null) : (s.result?.kind ?? null)),
};
```

- `state` builds, replays or loads the state (it may return a promise). Store ids and actions, not card text.
- `checkGallery(spec)`: a line per kind with no fixture, per fixture of an unlisted kind, per duplicate, and for no prompt kinds at all. Put `expect(checkGallery(spec)).toEqual([])` in a test: a new kind then fails until it has a fixture.
- `checkStates(spec, ms?)`: loads every fixture and reports the ones that throw, take longer than `ms` (10 s) or, with `kindOf`, no longer show their kind (harvest again).
- `keepBest(seen)`: for the script that finds fixtures. The game's loop plays its drivers and yields `{ group, kind, score?, value }` at each prompt and ending; one value per kind is kept (highest score, else the first), keyed `prompt:<kind>` / `ending:<kind>`.
- `checkActionCoverage({ states, legal, controls, key? })` (`coverage.ts`): over seeded states, a line per legal action (with target) no control sends, per unlabelled control and per control sending an illegal action; `controls` comes from the screen's own pure functions.
- `isDevMode(search?, allowed)`: `?dev=1` before the `#`, and only when `allowed`. Pass the build's dev flag (`isDevMode(undefined, import.meta.env.DEV)`); without it the answer is false, so a production build never opens the route unless the game passes `true`.

## The route
```tsx
<Gallery spec={spec} selected={route.parts[0] ?? null} href={(id) => routeHref('dev', 'home', [id])}
  render={(state, entry, answer) => entry.group === 'ending' ? <EndScreen state={state} /> : <PromptBody state={state} answer={answer} />}
  check={(state, picks) => { const v = validate(state, picks); return v.ok ? true : v.message; }} />
```
- `selected` is a fixture id or null; the links are plain `<a href>` from `href`, so any router works. `answer(picks)` calls `check` and lists the result; nothing is played. A `render` that throws shows that fixture's message; the gallery stays. "Open it again" remounts it. For e2e: `[data-testid="gallery-fixture"]` carries `data-group` and `data-kind`; `[data-testid="gallery-answers"]` is the list.

## Look
Only the shell is drawn here; the fixture has the game's look. Variables: `--gal-bg`, `--gal-text`, `--gal-border`, `--gal-link-bg`, `--gal-current-bg`, `--gal-current-text`, `--gal-alert`, `--gal-font`, `--gal-side-width`.

## Use it in 10 lines

```ts
import { fixtureId } from '../kit/prompt-gallery/index'

console.log(fixtureId('prompt', 'choose-one')) // one fixture per prompt kind; checkGallery fails on a kind with none
```

```tsx
import { Gallery } from '../kit/prompt-gallery/ui'
import type { GallerySpec } from '../kit/prompt-gallery/index'

declare const spec: GallerySpec<{ text: string }>
export const Dev = () => <Gallery spec={spec} selected={null} href={(id) => `#/dev/${id}`} render={(s) => <p>{s.text}</p>} />
```
