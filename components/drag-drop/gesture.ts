// K220 (Imperium src/ui/play/drag.ts): the gesture of dragging a source onto a target as a pure reducer, tested without a browser.
//   press    on a source that can be dragged, with the setting on: `pressed`;
//   move     less than DRAG_THRESHOLD_PX from the press: still `pressed` (released there it is a click, unchanged);
//            at least that far: `dragging` (the ghost follows the pointer; `over` is the target option id under it, or null);
//   escape   while dragging: `cancelled` (the ghost goes back at once; the release then does nothing);
//   cancel   the pointer is lost, the prompt changes or the source can no longer be dragged: the gesture ends;
//   release  over a target while dragging: `drop` with its id; anywhere else, or after Escape: nothing. Whenever the
//            gesture got as far as dragging, the click that follows the release is swallowed.

export const DRAG_THRESHOLD_PX = 8;

export interface DragGesture {
  /** The source's option id. */
  source: string;
  pointerId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  phase: 'pressed' | 'dragging' | 'cancelled';
  /** The legal target option id under the pointer. */
  over: string | null;
}

export type DragInput =
  | { type: 'move'; x: number; y: number; over: string | null }
  | { type: 'escape' }
  | { type: 'cancel' }
  | { type: 'release'; over: string | null };

export interface DragStep {
  /** The gesture after this input, or null when it has ended. */
  gesture: DragGesture | null;
  /** The target the source was dropped on, or null. */
  drop: string | null;
  swallowClick: boolean;
}

export function pressSource(source: string, pointerId: number, x: number, y: number, canDrag: boolean, settingOn: boolean): DragGesture | null {
  if (!canDrag || !settingOn) return null;
  return { source, pointerId, x0: x, y0: y, x, y, phase: 'pressed', over: null };
}

const far = (g: DragGesture, x: number, y: number): boolean => Math.hypot(x - g.x0, y - g.y0) >= DRAG_THRESHOLD_PX;

export function dragStep(g: DragGesture, input: DragInput): DragStep {
  const keep = (gesture: DragGesture | null): DragStep => ({ gesture, drop: null, swallowClick: false });
  switch (input.type) {
    case 'move': {
      if (g.phase === 'cancelled') return keep({ ...g, x: input.x, y: input.y, over: null });
      const dragging = g.phase === 'dragging' || far(g, input.x, input.y);
      return keep({ ...g, x: input.x, y: input.y, phase: dragging ? 'dragging' : 'pressed', over: dragging ? input.over : null });
    }
    case 'escape':
      return keep(g.phase === 'dragging' ? { ...g, phase: 'cancelled', over: null } : g);
    case 'cancel':
      return { gesture: null, drop: null, swallowClick: g.phase !== 'pressed' };
    case 'release':
      return { gesture: null, drop: g.phase === 'dragging' ? input.over : null, swallowClick: g.phase !== 'pressed' };
  }
}
