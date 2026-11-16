// Lifted from ebr src/ui/panel/hoverHold.ts: when a window closes over hoverable pieces the browser reports the pointer
// as entering the piece under it. Until the pointer really moves, pieces ignore that entering.
export interface HoverHold {
  start: () => void;
  move: (x: number, y: number) => void;
  held: () => boolean;
}

export function createHoverHold(movePx = 3): HoverHold {
  let heldAt: { x: number; y: number } | null = null;
  let last: { x: number; y: number } | null = null;
  return {
    start() {
      heldAt = last ?? { x: -1e6, y: -1e6 };
    },
    move(x, y) {
      last = { x, y };
      if (heldAt !== null &&Math.hypot(x - heldAt.x, y - heldAt.y) >= movePx) heldAt = null;
    },
    held: () => heldAt !== null,
  };
}

type MoveListener = (e: { clientX: number; clientY: number }) => void;

export interface PointerTarget {
  addEventListener: (type: 'pointermove', fn: MoveListener, capture: boolean) => void;
  removeEventListener: (type: 'pointermove', fn: MoveListener, capture: boolean) => void;
}

/** Feeds the pointer's moves to `hold`, in the capture phase so it runs before the pieces' own handlers. Returns the unbind. */
export function bindHoverHold(hold: HoverHold, target: PointerTarget): () => void {
  const fn: MoveListener = (e) => {
    hold.move(e.clientX, e.clientY);
  };
  target.addEventListener('pointermove', fn, true);
  return () => {
    target.removeEventListener('pointermove', fn, true);
  };
}
