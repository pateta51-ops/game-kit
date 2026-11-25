# Pattern: scoreboards and totals

No component: a rule for any screen that shows cells and a total of them. Kit part to use: K29 `foldView` (built: `components/paced-view/`) for the shown view; the picked mark is `components/picked-state/`.

## Rules that held
- A total changes at the same instant as the cell it sums, never before or after. Cell and total come from one shown view, not two timers.
- The open cell (the one still being filled) counts live in the total and is marked as open (its own mark, not the picked mark).
- When the cell is recorded, the recorded figure replaces the live one in place: same size, same position, no jump or flicker.
- Nothing shows before the motion that brings it. The screen draws the shown view (the view as of the paced step now playing), not the engine's latest state; K29 `foldView` folds the pre-answer view forward step by step. A figure that a flying piece is carrying is not yet in the cell or the total.
- Empty cells are always drawn as empty outlines, never hidden; a piece that lands fills one.

## Test
Step the paced queue and assert at each step that total equals the sum of the shown cells, and that no cell shows a figure its piece has not yet reached.
