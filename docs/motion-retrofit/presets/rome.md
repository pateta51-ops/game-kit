# Rome motion settings

Source at `e76d56f`

- `src/ui/motion/live/LiveMotion.tsx:413` and `src/ui/motion/MotionLab.tsx:345` rotate each column linearly by 55° clockwise or 48° counterclockwise. The SVG pivots are at x = 170, 420, 700, 850 and y = 360 in the 1000 × 420 view box.
- `src/ui/motion/live/plan.ts:107` gives the live duration of 2600 ms. `src/ui/motion/catalog.ts:298` gives the lab duration of 1800 ms. Keep the artwork and banner opacity on the game side.

```ts
export const collapseSpin = {
  liveMs: 2600,
  labMs: 1800,
  columns: [170, 420, 700, 850].map((x, i) => ({
    turns: (i % 2 ? 48 : 55) / 360,
    direction: i % 2 ? -1 : 1,
    pivot: `${x / 10}% ${360 / 420 * 100}%`,
    ease: 'linear',
  } as const)),
};
```

These pivots assume each actor uses the whole view box. If actors use tighter boxes, express each pivot relative to its actor's box.

The kit's static tap pose comes from game-kit `cb69479`, `components/card-attachments/HostStack.tsx:33`. Its card rotates 90° clockwise around its centre. Tap and untap use that pose. Duration comes from the calling step.

For a turned enemy, set `angle: 180` on `tap` or on a standalone `untap`.
# Rome motion presets

## Collapse backdrop

Use `debris` over the ruins SVG's original box (left 2%, top 60 px, width 96%, height 480 px within the stage). For the SVG's centred `1000 × 420` viewBox, use `unit = Math.min(boxWidth / 1000, boxHeight / 420)` and the box centre as the actor anchor. Use `count: 10`, `spread: [0, 0]`, `gravity: 0`, `spin: 0`, `ms: 1800`, `fade: [1500, 1800]`, and `groupFade: true`. The original columns fall visually by rotating linearly about their feet for all 1800 ms, with no translation, acceleration, or scaling. The base, columns and embers draw in that order and fade as a single composited group over the final 300 ms. Embers also ramp their own opacity from 0 to 1 linearly over the full cue.

Supply the following `pieces`. Positions below are in the SVG's coordinates. Subtract `[500, 210]` when setting each piece's `at`, and draw its path relative to that pivot.

| Pieces | Pivots | Local path and paint |
| --- | --- | --- |
| Base | (0, 0) | `M30 370H970L900 400H90Z` filled `#675448`. |
| Columns | (170, 360), (420, 360), (700, 360), (850, 360) | `M-30 -230h60v230h-60z M-48 -250h96v30h-96z M-45 -10h90v25h-90z` filled `#a08b72` and stroked `#594539` at width 5. In `paint` add the crack `M-30 -110l25 -20 10 35 25 -20` stroked `#40352d` at width 7. Spins are 55°, −48°, 55°, −48°. |
| Embers | (90, 380), (280, 380), (550, 380), (760, 380), (920, 380) | `M0 0q-35 -35 0 -100q0 40 23 52q20 35 -23 48`, alternating `#df8d35`, `#ab4328`, with `growOpacity: true`. |

The descending scroll remains in the game. Its descent takes the first 30% of the 1800 ms cue and its unroll takes the next 30%.

Source: `src/ui/motion/catalog.ts`, `src/ui/motion/live/LiveMotion.tsx` and `src/ui/motion/live/live.css` at `e76d56f`.

### Crumple and disappear (K330)

Sources at `e76d56f` are `src/ui/motion/crumple.ts` (mesh and alpha shader)
and `src/ui/motion/TrashMotion.tsx` (clock, pose and transparency at 1,130 ms).
Use the mesh values from the [STCC preset](stcc.md#crumple-and-landed-still-k330).
Use a stage box around the preview with left and top `x, y` and dimensions
`w, h`. The actor's centre is `[x + .18*w, y + .52*h]` and the destination
centre is `[x + .82*w, y + .52*h]`.

```ts
const choreography = {
  meshSize: [250, 435], foldMs: 600, foldPower: 1.6, holdMs: 110, throwMs: 420,
  tilt: [10, -14, -12], initialTilt: true, turn: [0, 0, -300], wobble: 0,
  lift: [0, 140], airScale: 0, endScale: .35,
  arc: .38 * h / actorHeight, squash: [0, 0, 0], sink: [0, 0], fadeOut: true,
  dur: 1130,
} as const;
```

`actorHeight` is the actor rect height used for the arc calculation. The source
renders at full opacity through the flight and drops to zero at the end. A
longer step can hold the transparent endpoint.
