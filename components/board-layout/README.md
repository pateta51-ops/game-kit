# board-layout

Draw the map once over the board picture in Inkscape; get the click areas (space rects) and the adjacency list from the drawing. Pure functions, no packages, loads in node. Lifted from the Rally the Troops tools (ISC, notice in component.json).

## Use

1. `newLayoutSvg(width, height, 'board.jpg', ['Rome', 'Ostia,red,60,40,100,80'])`: a blank SVG with the picture locked as backdrop and one box per name (`name` or `name,color,w,h,x,y`; boxes without x,y wait outside the map).
2. In Inkscape, move and resize the boxes (rect, circle or ellipse; the Inkscape label is the space name) and draw a path between two spaces for each connection. Group by `<g>` label for kinds of space.
3. `parseLayout(svgText | svgTexts)` returns `{ nodes, groups, edges, adjacency, warnings }`:
   - `nodes`: name to `[x, y, w, h]`; `groups`: the same under the group path (`Forts/North`).
   - `edges`: `[a, b, x1, y1, x2, y2]`, each path end matched to the nearest space centre; `adjacency`: name to neighbours.
   - A box with no label takes the nearest `<tspan>` text within 75 units. `warnings` lists duplicate labels and unmatched ends.
4. `spaceAt(layout, x, y)`: the space under a point.

Save the data as JSON or a TS file in the game; the SVG stays a source asset.

## Zones (screen layouts)

A layout JSON `{ w, h, zones: { id: { r: [x, y, w, h], ...anything } } }` (a wireframe tool's output, or `zonesOf(parsed, w, h)` from the board above) places every part of a fixed-size screen; components read their zone, never type a position. Each placer returns `{ position: 'absolute', left, top, width, height }`, a React style as is.

- `zone(L, id, pad?)`: stage pixels, grown by `pad` on each side (for a `Stage` from `app-frame`).
- `zonePct(L, id, parent?, dx?, dy?)`: percent of the stage, or of the zone `parent` when the element sits inside that zone's element; `dx`/`dy` shift it in stage units.
- `zoneRect(L, id)`: the rect (`[0, 0, 0, 0]` for a missing id).
- `slots(L, 'roster')`: the zones `roster.1`, `roster.2`, ... in number order (`roster.1.text` and `rosterx` are not slots).
- `withZones(L, { id: [x, y, w, h] })`: a copy with zones moved or added (e.g. the zones a fixed head would cover).

## Limits

- The SVG must be saved by Inkscape with one attribute per line, and must use no `transform` attributes (ungroup, or apply transforms in Inkscape).
- Paths: M, m, C, c, L, l, H, h, V, v and bare pairs; the last point is the end. A path ends at the nearest space even if far away.
- Rects only; no polygon areas.
