// Two small pieces of a phone table: a fixed-size piece drawn at a box width, and a commit-flag second tap.
import type { CSSProperties, ReactNode } from 'react';
import { scaleFor } from './commitHook';

/** A `w` x `h` piece drawn at a `box` px width (height follows); the piece keeps its own size, so its layout is unchanged. */
export function Scaled({ w, h, box, children, className, testId }: { w: number; h: number; box: number; children: ReactNode; className?: string; testId?: string }) {
  const s = scaleFor(w, box);
  const outer: CSSProperties = { width: box, height: h * s, overflow: 'hidden' };
  const inner: CSSProperties = { width: w, height: h, transform: `scale(${s})`, transformOrigin: 'top left' };
  return (
    <div className={className} data-testid={testId} style={outer}>
      <div style={inner}>{children}</div>
    </div>
  );
}
