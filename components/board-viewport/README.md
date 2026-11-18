Fit, zoom and pan a large SVG or DOM board, and move the camera to a game-supplied rectangle.

Use `index.ts` for package-free view math in Node and `ui.ts` for the React wrapper. This component keeps the existing `board-layout` drawing and hit-area utilities package-free. It operates on a board transform and follows motion-frame's 350 ms ease-in-out and manual-input cancellation. Motion-frame's phone pan keeps handling scroll containers.

## View math

A `Rect` is `[x, y, width, height]` in board units with positive width and height. A `View` maps a board point to viewport CSS pixels by multiplying by `scale` and then adding `x` and `y`. Supply finite dimensions and positive, ordered scale limits.

- `zoomAbout(view, factor, point, limits)` uses a viewport pixel point. Clamping at a board edge or centering an undersized axis can move the point.
- `clampView(view, limits)` holds the board against the viewport edges and centers any axis that fits.
- `fitRect(rect, limits)` centers the rect as closely as the board bounds and scale limits allow.
- `tweenView(from, to, elapsedMs, speed?)` uses a duration of 350 ms multiplied by speed. Speed 0 returns the target immediately.

## React

Give the viewport a width and height through its class or style. Draw children at their intrinsic board dimensions. The wrapper clips overflow and uses one transform for the entire board. Wheel and pinch zoom, a five client-pixel drag pans, and a shorter press still clicks the piece. Put game-supplied camera controls beside the viewport.

The ref exposes the live `view`, `fit()` for an immediate whole-board fit, and `focus(rect)` for an eased fit to a board rectangle. Speed 0 and reduced motion make focus immediate. A viewport resize refits the most recent camera rectangle. The default scale range is whole-board fit through eight times that scale. `minScale` and `maxScale` override those limits in CSS pixels per board unit.

## Use it in 10 lines

```tsx
import { useRef } from 'react';
import { BoardViewport, type BoardViewportHandle } from '../kit/board-viewport/ui';

export function Board() {
  const camera = useRef<BoardViewportHandle>(null);
  return <><button onClick={() => camera.current?.fit()}>Fit</button>
    <button onClick={() => camera.current?.focus([400, 300, 100, 100])}>Focus</button>
    <BoardViewport ref={camera} bounds={[0, 0, 1200, 800]} style={{ height: 400 }}>
      <svg width={1200} height={800}><rect x={400} y={300} width={100} height={100} /></svg>
    </BoardViewport></>;
}
```

Open `components/board-viewport/fake/index.html` through Vite to try the SVG grid.

## Tap check (real browser)
`components/board-viewport/e2e/tap.mjs` starts its own Vite on the demo and checks a phone tap (390x844, touch), a mouse click and a mouse/touch drag that must not click. Run in WSL: `export NODE_PATH=$HOME/codex/base/node_modules; node components/board-viewport/e2e/tap.mjs`. A click is swallowed only after a real drag past 5 px; stale contacts (release outside, pointercancel, older than 1.5 s) are dropped.
