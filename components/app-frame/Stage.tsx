// Lifted from 7th Inning Stretch src/ui/screens/Stage.tsx: a fixed-size stage scaled to fit the window, with one of the
// game's fixed heads (a logo and a Home button for menus, the Home button alone for flow screens) at one rect on top.
import type { ReactNode } from 'react';
import { useStageScale } from './stageScale';

export type StageHead = { rect: readonly [number, number, number, number]; node: ReactNode };
export interface StageProps<H extends string = string> {
  layout: { w: number; h: number };
  children?: ReactNode;
  className?: string;
  heads?: Readonly<Partial<Record<H, StageHead>>>;
  head?: H;
}

export function Stage<H extends string = string>({ layout, children, className, heads, head }: StageProps<H>) {
  const scale = useStageScale(layout.w, layout.h);
  const h = head === undefined ? undefined : heads?.[head];
  return (
    <div className="kit-stage-viewport" style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <div className={className === undefined ? 'kit-stage' : `kit-stage ${className}`} data-testid="stage" style={{ position: 'relative', transformOrigin: '0 0', width: layout.w, height: layout.h, transform: `scale(${String(scale)})` }}>
        {children}
        {h && (
          <div className="kit-stage-head" data-head={head} style={{ position: 'absolute', left: h.rect[0], top: h.rect[1], width: h.rect[2], height: h.rect[3] }}>
            {h.node}
          </div>
        )}
      </div>
    </div>
  );
}
