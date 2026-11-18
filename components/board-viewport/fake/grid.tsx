import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BoardViewport, type BoardViewportHandle } from '../ui.ts';

export function Grid() {
  const camera = useRef<BoardViewportHandle>(null);
  const [picked, pick] = useState(false);
  return (
    <main style={{ fontFamily: 'system-ui' }}>
      <button onClick={() => camera.current?.fit()}>Fit board</button>{' '}
      <button onClick={() => camera.current?.focus([700, 400, 200, 200])}>
        Focus cell
      </button>{' '}
      <output>{picked ? 'Cell selected' : ''}</output>
      <BoardViewport
        ref={camera}
        bounds={[0, 0, 1200, 800]}
        style={{ height: 'calc(100dvh - 50px)', background: '#182530' }}
      >
        <svg
          width={1200}
          height={800}
          style={{ display: 'block' }}
          aria-label="Board grid"
        >
          <defs>
            <pattern
              id="grid"
              width={100}
              height={100}
              patternUnits="userSpaceOnUse"
            >
              <rect
                width={100}
                height={100}
                fill="#f4f1e9"
                stroke="#87949e"
                strokeWidth={2}
              />
            </pattern>
          </defs>
          <rect width={1200} height={800} fill="url(#grid)" />
          <rect
            id="cell"
            x={750}
            y={450}
            width={100}
            height={100}
            fill={picked ? '#208b79' : '#e39a44'}
            onClick={() => pick(!picked)}
          />
          <text
            x={800}
            y={510}
            textAnchor="middle"
            fontSize={24}
            pointerEvents="none"
          >
            Cell
          </text>
        </svg>
      </BoardViewport>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Grid />);
