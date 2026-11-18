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
