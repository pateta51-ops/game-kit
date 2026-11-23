Must use: card-zoom:placeZoom, card-zoom:transcribe, card-zoom:CardZoom, card-attachments:HostStack

## Built new
- src/screen/table/Inspect.tsx | search: panel beside card options; hover enlarge card inspect; place preview next to anchor | nearest: card-zoom placeZoom + ui-helpers createInspect | why: both are used as they are (placeZoom places, createInspect times); this file is only the glue: the anchor's screen box over the stage's measured scale (the stage is CSS-zoomed, placeZoom wants one coordinate space), the framed panel, and the body drawn from the game's own zoom text (zoomText.ts, Printed, KeywordBox); card-zoom `transcribe` needs an icon table and a glossary index the game does not build yet
- src/screen/table/b2.test.tsx | search: card test real pack dom; test helper draw table main phase | nearest: none (b1.test.tsx has the same local `draw`) | why: the table's DOM checks of B2 against the real pack; no kit helper renders this game's table

## Kit gap
- board-viewport: no fixed-scale wheel-pan mode, so the table keeps its native overflow scroll | readme: "6. Set `minScale` / `maxScale` (CSS pixels per board unit) only to override the defaults (whole-board fit up to eight times that)." | tried: e2e screen-table.spec.ts with the table inside BoardViewport -> the wheel zooms the table instead of scrolling it
- table-panels `LogPanel`: oldest first, no newest-first order, so the game's `LogLines` stays | readme: "- `<LogPanel lines seats? seatName? turnName? renderLine? />`: grouped by turn, scrolled to the newest, seat filter buttons when `seats` is given." | tried: vitest Table.test.tsx with LogPanel in the sidebar -> the newest line is last, not first

## Kit override
none
