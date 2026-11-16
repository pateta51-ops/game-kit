# prompt-gallery

One game state per prompt kind and per ending, a check that fails when a kind has none, and a dev route that shows each on the game's own components. `index.ts` loads in node (scripts, tests); `ui.ts` is the React route.

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
