# track

A row of spaces with a marker that glides, on a drawn row or on spots of a mat image; a hop-and-fill bar with a multiplier badge; a step list with one lit step. Unstyled: `data-part` hooks only. The game owns layout, colours and every word. The rule side of a track (steps, thresholds, per-space values) is `clock`; draw its state here unchanged.

## Rules for agents

**What it does:** A row of spaces with a gliding marker (drawn or on a mat image), a hop-and-fill bar with a multiplier badge, and a step list with one lit step; unstyled, with `data-part` hooks.

**You must:**
1. Install `react`; the component needs `counter` and `motion-frame`.
2. Pass every word through `words` (and `label`, `markerLabel`); no colour, font, icon or word comes from the kit.
3. Style by the `data-part` and `data-state` hooks yourself; on a `mat`, spaces are `position: absolute` and the game centres them with CSS.
4. Pass `speed` as `() => Speed` from settings (0 or `'instant'` and reduced motion give no glide), and `undone` as a value that changes on every undo or redo (game-store's undos plus redos) so the marker jumps instead of gliding.
5. For `HopTrack`, draw the fill from `--v` (call `registerFill()` so it animates) and pass `color`; a new value during a hop ends the run.
6. Give each mark a letter and a name so colour is never the only signal.
7. Use `StepTrack` for a phase list with a lit step; a banner that fires on a change is table-panels' `TurnBanner`.
8. Use `planTrackUps` for the prime, hold, release pattern with the game's animation queue; no pan is done, the game scrolls to the track.

**Common mistakes:**
- Expecting a backward glide: forward only unless `backward` is set.

- `<Track spaces index words label markerLabel? marker? mat? speed? backward? undone? renderValue? renderMark? renderEffect? />`: `ol[data-part=track][data-layout=row|mat] > li[data-part=space][data-state=past|current|future|skipped]` with `aria-current="step"` on the current space and an `aria-label` and `title` built from the game's `words`. A space holds `[data-part=value]`, `[data-part=marks]` (each mark a letter and a name, so colour is never the only signal; `[data-part=effect]` for an optional effect, icon through `renderEffect`) and, on the current one, `[data-part=marker]` with `markerLabel`. `max: true` marks the last space.
- `mat={{ src, spots }}`: the same list laid at `spots[i] = [x, y]` (fractions 0..1 of the image; board-layout `zonePct` gives them from a layout) over `img[data-part=mat-image]`; `marker` is the marker's image (`[data-part=glide]`); `children` are more pieces on the mat. The spaces are `position: absolute`; centre them with the game's CSS.
- Glide (`useMarkerGlide(listRef, index, opts)`, used by `Track`): FLIP from the old space to the new, 650 ms times the speed, a small rise and 1.15 scale; forward only unless `backward`. `undone`: any value that changes on an undo or redo (game-store: the number of undos plus redos): the marker jumps. No glide at speed 0, `'instant'` or reduced motion. `speed` is the player's factor, `() => Speed`, default 1.
- `<HopTrack value max mult? label multText? speed? backward? undone? />`: the second style. `div[data-part=bar]` carries `--v` (the game draws the fill from `--v`; `registerFill()` registers it as a number so it animates) and `i[data-part=dot]` hops; one step 360 ms, each further 120 ms. The old number stays and a new badge is hidden during the hop; at its end the number ticks and bumps (counter `bumpCounter`) with a soft `[data-part=light]` (520 ms) behind it. At a new multiplier above 1 `[data-part=badge]` pops, two `[data-part=pulse]` rings go out, 22 `[data-part=spark]`s fly (fixed `span`s on the body, made by `landingEffects(el, scale, opts)`) and a `[data-part=rise]` "×N" rises; without a new multiplier the number waits half the light's time. A new value mid-hop ends the run (animations cancelled, extras removed). Colours: the game's `color`.
- `planTrackUps(before, after, { prime, hop, restore, can? })`: the prime / hold / release pattern for the game's animation queue: `{ hold, arrive, release }` for the tracks whose value rose (`trackUps`), or `null`. No pan: the game scrolls to the track.
- `<StepTrack steps current label />`: `ol[data-part=steps] > li[data-part=step][data-lit][aria-current=step] > span[data-part=name]`, every name shown. A phase list with a lit step; a banner that fires on a change is table-panels' `TurnBanner`, not this.
- Pure (node-testable): `stateOf`, `spaceLabel(space, i, state, words)`, `glideMs`, `glideFrames`, `hopPlan(from, to, multFrom, multTo, opts)` (`{ ms, bump, badge, mult }`), `hopFrames`, `stepsOf`, the timings (`GLIDE_MS`, `HOP_MS`, `HOP_EXTRA_MS`...).

## Look

Nothing is drawn but the parts above; no colour, font, icon or word comes from the kit. `StepTrack` keeps the structure of LotR's PhaseTracker (BSD-3-Clause, notice in `LICENSE-LordOfTheRings.txt`).

## Use it in 10 lines

```tsx
import { Track, type Space, type TrackWords } from '../kit/track/index'

const words: TrackWords = { space: (n) => `Space ${n}`, value: (v) => `danger ${v}`, max: 'the game is lost here', skipped: 'skipped', here: 'the marker is here' }
const spaces: Space[] = [{ value: 1 }, { value: 2, marks: [{ id: 'r', letter: 'R', name: 'red border' }] }, { value: 3, max: true }]
export const Danger = ({ at, undos }: { at: number; undos: number }) => (
  <Track spaces={spaces} index={at} words={words} label="Danger track" markerLabel="Marker" undone={undos} speed={() => 1} />
)
```
