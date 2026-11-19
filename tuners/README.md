# tuners

Interactive pages that show one kit part live, with sliders for its tunable values, so the owner can settle its defaults by eye. Each page is one self-contained HTML file: open it in a browser from this folder, or use its published Artifact link below.

| Tuner | Component | What it tunes | Artifact |
| --- | --- | --- | --- |
| [card-hand.html](card-hand.html) | card-hand | the fan's arc, spacing, lift, grow, stand-up, motion time | (link removed)> |
| [effect-library.html](effect-library.html) | effect-library, motion-frame | motion verbs, flights and trails, rotations, beams, combat, transfers, signals, refresh and live loops | to publish |
| [target-arrow.html](target-arrow.html) | target-arrow | arrow colours, stroke, dash flow, head, curve, snap and strike timing | (link removed)> |
| [glows.html](glows.html) | picked-state, prompt-host, card-parts, counter | picked marks, legal glows, inline icon glow, counter motion and thresholds | (link removed)> |
| [card-motion.html](card-motion.html) | deck-motions, card-pile, market-row | deal, refill turn-over, deck cycle, riffle, pile edges and fan, market refill by slide | (link removed)> |
| [riffle.html](riffle.html) | deck-motions | top-view and side-view riffle, each with speed, cards, orientation and the four phase timings | to publish |
| [energy.html](energy.html) | effect-library | column, curved and rotating beams, warp and spiral transfers, projectile, shield bubble, plasma orb, reticle, drift cloud | to publish |
| [token-motion.html](token-motion.html) | token-flights, token-bag, track | token flights, 2D and 3D bag draws, marker glide, hop-and-fill, and lit steps | (link removed)> |
| [pieces-motion.html](pieces-motion.html) | pieces-3d, pieces-3d-verbs, drag-drop | d6 and d10 rolls, ball roll and settle, chip depth and shadows, drag ghost | (link removed)> |

## How a tuner is made

- The source is `src/<name>.html`. `node tuners/build.mjs` writes `<name>.html`, inlining the kit's own code: `/*@kit-css <path>*/` becomes that CSS file, and `//@kit-js <path> as NAME` becomes that module bundled as the global `NAME`. A tuner never copies kit code by hand, so it always shows what games ship.
- `npm run components:check` runs `node tuners/build.mjs --check`. It fails when a built page is older than its source or than the kit code it inlines. After changing a component that a tuner inlines, run `node tuners/build.mjs` and commit the page.
- The page layout: a stage on top with the live effect, then presets ("Kit default" first, read from the kit's own constants, never typed in again), then sliders grouped by what they change, each with its unit and a one-line help, then "These settings in code": the exact props and CSS tokens a game sets, with a Copy button. An effect that plays once has a Play button and replays on every slider change. The page works at phone width, has no game names except in a preset that shows a game's current values, and loads nothing beyond Google Fonts.
- The steward publishes each page as a private Artifact (republishing to the same link after a change) and records the link in the table above.
