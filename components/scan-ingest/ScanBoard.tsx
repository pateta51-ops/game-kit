// A printed scan with the game's state drawn into its boxes (the image, then one absolutely placed element per box in
// the scan's own proportions), and one scanned die-cut piece at true size. Structure only: the game draws what goes in a box and styles `data-part`.
import type { CSSProperties, ReactNode } from 'react';
import { boxStyle, clipPathOf, mmStyle, trimOutline, type Box, type Outline } from './board.ts';

export interface ScanBoardProps {
  src: string;
  scanW: number;
  scanH: number;
  /** The board's drawn width in px (any scale). */
  width: number;
  /** The board's real width in mm: sets `--mm` (px per mm) so pieces inside are drawn at true size. */
  boardMm?: number;
  /** Normalised boxes (`planOverlay`). */
  boxes: Record<string, Box>;
  /** What the state draws in a box, given the box's size in px; null or undefined leaves the print showing. */
  render: (id: string, size: { w: number; h: number }) => ReactNode;
  onFail?: () => void;
  children?: ReactNode;
}

export function ScanBoard(p: ScanBoardProps) {
  const height = (p.width * p.scanH) / p.scanW;
  const style = { position: 'relative', width: p.width, height, ...(p.boardMm ? { '--mm': `${String(p.width / p.boardMm)}px` } : {}) } as CSSProperties;
  return (
    <div data-part="scan-board" style={style}>
      <img src={p.src} alt="" draggable={false} onError={p.onFail} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
      {Object.entries(p.boxes).map(([id, b]) => {
        const node = p.render(id, { w: b.w * p.width, h: b.h * height });
        return node == null ? null : (
          <div key={id} data-scan-box={id} style={{ position: 'absolute', ...boxStyle(b) }}>
            {node}
          </div>
        );
      })}
      {p.children}
    </div>
  );
}

/**
 * A scanned piece cut to its die-cut outline (a little inside it with `trim`), sized `calc(var(--mm) * mm)` from its
 * measured `sizeMm`; `cutout` art (already transparent) is not clipped. Decoration: the game writes the number beside it.
 */
export function Piece(p: {
  src: string;
  width: number;
  height: number;
  sizeMm?: readonly number[] | null;
  outline?: Outline | null;
  cutout?: boolean;
  trim?: boolean;
  style?: CSSProperties;
}) {
  const clip = p.cutout ? undefined : clipPathOf(p.trim ? trimOutline(p.outline) : p.outline);
  const mm = mmStyle(p);
  const sized = '--w-mm' in mm ? { width: 'calc(var(--mm, 1px) * var(--w-mm))', height: 'calc(var(--mm, 1px) * var(--h-mm))' } : {};
  return (
    <img
      data-part="scan-piece"
      src={p.src}
      alt=""
      draggable={false}
      decoding="async"
      style={{ ...mm, ...sized, ...p.style, ...(clip ? { clipPath: clip } : {}) }}
    />
  );
}
