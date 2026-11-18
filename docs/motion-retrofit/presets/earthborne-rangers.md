# Earthborne Rangers motion settings

`src/ui/motion/effects.ts:164` and `src/ui/table/Board.tsx:76` turn upright card artwork clockwise on exhaust and back on ready. Use `tap` and `untap` with `dur: 450`, `angle: 90`, `overshoot: 6` and `ease: 'cubic-bezier(.4,.1,.3,1)'`. The overshoot frame uses offset .78. The original starts the next action after 130 ms. Pair with a move when the card centre changes. The exhaustion banner has its own scale and opacity sequence.


At `59e0ad1d`:

- `src/ui/index.css:45–55` uses `pulse` on each offered destination with `period: 1800` and `easing: 'ease-in-out'`. Frames are `[{}, { filter: 'drop-shadow(0 0 7px #deac42)', opacity: 0.65 }, {}]` so the ends use the element's own look. Stop when the decision closes.
- `src/ui/motion/motion.css:72–81` uses `idle` with `kind: 'bob', rise: 10, period: 2400, easing: 'ease-in-out'` on the resolving face. Stop when forward motion ends or is skipped. Scale both periods by the motion speed.
