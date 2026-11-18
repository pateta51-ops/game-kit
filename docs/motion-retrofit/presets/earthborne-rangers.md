# Earthborne Rangers motion settings

`src/ui/motion/effects.ts:164` and `src/ui/table/Board.tsx:76` turn upright card artwork clockwise on exhaust and back on ready. Use `tap` and `untap` with `dur: 450`, `angle: 90`, `overshoot: 6` and `ease: 'cubic-bezier(.4,.1,.3,1)'`. The overshoot frame uses offset .78. The original starts the next action after 130 ms. Pair with a move when the card centre changes. The exhaustion banner has its own scale and opacity sequence.
