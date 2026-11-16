// The rolling ball and the thick chip as React pieces. Looks come from the caller and from CSS variables.
import { useEffect, useRef, type CanvasHTMLAttributes, type ImgHTMLAttributes } from 'react';
import { ID } from './solids';
import { paintBall, type BallLook } from './ball';
import './pieces3d.css';

/** A sphere at rest; a motion layer repaints its clone with `paintBall` as it rolls. */
export function Ball({ look, className, ...rest }: { look?: BallLook | undefined } & CanvasHTMLAttributes<HTMLCanvasElement>) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = c.height = Math.min(220, Math.max(64, Math.round(c.getBoundingClientRect().width * Math.min(2, window.devicePixelRatio || 1)))) || 110;
    paintBall(c, ID, look);
  }, [look]);
  return <canvas ref={ref} role="img" data-ball="" className={`p3-ball${className ? ` ${className}` : ''}`} {...rest} />;
}

/** A slab: the printed face on top, board core at its near side, a cast shadow (pieces3d.css). */
export function Chip({ className, ...img }: ImgHTMLAttributes<HTMLImageElement>) {
  return <span className="p3-chip"><img className={className} {...img} /></span>;
}
