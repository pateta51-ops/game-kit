Must use: card-zoom:placeZoom, card-zoom:transcribe, card-zoom:CardZoom, card-attachments:HostStack

## Built new
- src/screen/table/Inspect.tsx | search: panel beside card options; hover enlarge card inspect; place preview next to anchor | nearest: card-zoom placeZoom + ui-helpers createInspect | why: both are used as they are (placeZoom places, createInspect times); this file is only the glue: the anchor's screen box over the stage's measured scale (the stage is CSS-zoomed, placeZoom wants one coordinate space), the framed panel, and the body drawn from the game's own zoom text (zoomText.ts, Printed, KeywordBox); card-zoom `transcribe` needs an icon table and a glossary index the game does not build yet
- src/screen/table/b2.test.tsx | search: card test real pack dom; test helper draw table main phase | nearest: none (b1.test.tsx has the same local `draw`) | why: the table's DOM checks of B2 against the real pack; no kit helper renders this game's table

## Kit gap
- board-viewport: the brief asks for it to pan the table under the pinned hand. It zooms on the wheel, starts at a whole-board fit and has no fixed-scale wheel-pan mode, so the table keeps its native overflow scroll (wheel and touch pan work; the loop strip still scrolls to the mat). A wheel-pans-vertically, scale-1 mode would let it replace that.
- table-panels `LogPanel`: shows oldest first, grouped by turn, scrolled to the newest, no whole-lines-only column and no newest-first order, so the game's `LogLines` (newest first, wrapping column, only whole lines) stays for N17.
- card-attachments (upgrade tucked on its host): not used. The options panel shows each upgrade on offer as its own card next to the Buy plate; the tuck would need the host's card box inside the panel.
- card-zoom `transcribe`/`CardZoom` is not adopted for the right-click text; the game's own zoom lines are reused (see Built new). A separate batch would move the game's icons and glossary into the kit's shapes.

## Kit override
none
