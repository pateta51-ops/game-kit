# effect-library

The twelve verbs of the director's spec format as DOM effects for the motion frame: `move`, `lift`, `settle`, `fade-in`, `fade-out`, `show`, `hide`, `flip`, `scale`, `shake`, `glow`, `text`. Web Animations API; browser only. Particles, count-up and the like are not in it.

```ts
const verbs = createVerbs<EffectCtx>();
const layer = registerEffects(verbs, { resolve: (id) => document.getElementById(id) ?? undefined });
const player = createMotionPlayer({ specs, stages, verbs, speed, context: layer, onBeatEnd: (run) => layer.end(run) });
```

- The layer is one `div.fx-layer` (fixed, full page, no pointer events). Stage rects are its pixels; a scaled stage sets a transform on `layer.el`.
- An actor or zone is a clone of `resolve(id)` (never the original; its `id` is removed) or a plain box. Hidden actors start at opacity 0. A clone is made at the first verb that uses it, or for every actor of the beat at its start when the game calls `layer.start(run)` from `onBeatStart` (needed when a live piece is hidden at the start and the stand-in must cover it); `layer.end(run)` removes the run's clones.
- End state, set when the call ends or on `skipAll`: `move` at the target rect, `lift` lifted (`to` number = scale), `settle` at rest, `scale` at the number, `flip` toggled (`data-fx-flipped`; the game's CSS shows the other face), `text` shown (step `text`, else the number), `fade-out` at 0, `hide` hidden. `shake` (step `times`) and `glow` end at rest. `move` with `then: hide` ends hidden; `scale` with `pulse: true` returns to rest; `fade-out` ends at `to` (default 0); `flip` sets `data-fx-label` from `label` (the game's CSS shows it with `attr()`; the kit never writes a counter); `text` shows `text` or `label`, fading in over the first quarter of the call while it rises over all of it. A step's `ease` (`in`, `out`, `in-out`, `linear`, or any CSS easing) is the easing. An actor's `opacity` is applied; `veil: true` gives the clone class `fx-veil` and `background: var(--fx-veil)`.
- Verbs at the same time on one actor compose: `move` animates `translate` and `scale` animates `scale` (the end state is in `style.translate`, `style.scale`); `lift`, `settle`, `flip`, `shake`, `text` use `transform`, so after a kept `scale` they multiply with it. Breaking since v0.17.0: code reading `style.transform` for `move` or `scale`, or setting its own CSS `scale`/`translate` on the actor, must change. `resolve(id, run)` gets the run, so a game can tell two beats' actors of the same id apart.
- Reduced motion is the player's: `withReducedMotion(speed)` gives `'instant'`, no verb runs and no clone is made.
- Own effects: `registerEffect(verbs, 'name', ({ call, run, el, layer, animate }) => ...)`. `animate(keyframes, endStyle)` plays over the call's duration and jumps to `endStyle` on finish or skip; a returned function is called then too.

## Look

CSS variables a game sets (fallbacks carry no colour): `--fx-z`, `--fx-lift-rise`, `--fx-lift-shadow`, `--fx-settle-shadow`, `--fx-glow`, `--fx-glow-off`, `--fx-shake`, `--fx-text`, `--fx-text-font`, `--fx-text-rise`, `--fx-veil`.

Tests: `effects.e2e.test.ts` (Chromium via Playwright; skipped off CI when it is not installed).
