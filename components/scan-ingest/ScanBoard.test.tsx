import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Piece, ScanBoard, planOverlay } from './ui.ts';

const boxes = planOverlay(
  [
    { id: 'score', usual: { x: 0.1, y: 0.2, w: 0.1, h: 0.1 } },
    { id: 'round', usual: { x: 0.7, y: 0.6, w: 0.2, h: 0.1 } },
  ],
  undefined,
).boxes;

describe('ScanBoard (K373)', () => {
  it('renders the state into the right boxes, at any width', () => {
    for (const width of [390, 1366]) {
      const { container, unmount } = render(
        <ScanBoard src="/board.png" scanW={800} scanH={600} width={width} boardMm={400} boxes={boxes} render={(id, s) => (id === 'score' ? <b>{`7@${String(Math.round(s.w))}`}</b> : null)} />,
      );
      const box = container.querySelector<HTMLElement>('[data-scan-box="score"]')!;
      expect(box.textContent).toBe(`7@${String(Math.round(width * 0.1))}`);
      expect(box.style.left).toBe('10%');
      expect(box.style.top).toBe('20%');
      expect(container.querySelector('[data-scan-box="round"]')).toBeNull();
      expect((container.firstChild as HTMLElement).style.getPropertyValue('--mm')).toBe(`${String(width / 400)}px`);
      unmount();
    }
  });

  it('draws a piece cut to its outline at its size in mm', () => {
    const { container } = render(<Piece src="/t.png" width={100} height={100} sizeMm={[20, 20]} outline={[[0, 0], [1, 0], [0.5, 1]]} />);
    const img = container.querySelector('img')!;
    expect(img.style.getPropertyValue('--w-mm')).toBe('20');
    expect(img.style.clipPath).toContain('polygon(');
  });
});
