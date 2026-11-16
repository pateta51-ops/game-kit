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

## Limits

- The SVG must be saved by Inkscape with one attribute per line, and must use no `transform` attributes (ungroup, or apply transforms in Inkscape).
- Paths: M, m, C, c, L, l, H, h, V, v and bare pairs; the last point is the end. A path ends at the nearest space even if far away.
- Rects only; no polygon areas.
