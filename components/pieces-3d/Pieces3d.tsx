// The rolling ball and the thick chip as React pieces. Looks come from the caller and from CSS variables.
import type React from 'react';
import { useEffect, useRef, type CanvasHTMLAttributes, type ImgHTMLAttributes } from 'react';
import { ID } from './solids.ts';
import { paintBall, type BallLook } from './ball.ts';
import { tokenSize, type Recess, type TokenMm } from './token.ts';
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

/** A slab: the printed face on top, board core at its near side, a cast shadow (pieces3d.css). `dieCut`: edge and shadow follow the picture's alpha outline (round or irregular transparent tokens), not a rectangle. */
export function Chip({ className, tilt, dieCut, ...img }: { tilt?: string; dieCut?: boolean } & ImgHTMLAttributes<HTMLImageElement>) {
  return <span className={dieCut ? 'p3-chip p3-diecut' : 'p3-chip'} data-p3-diecut={dieCut ? '' : undefined} style={tilt ? ({ '--piece-tilt': tilt } as React.CSSProperties) : undefined}><img className={className} {...img} /></span>;
}

/** K718: a die-cut token as a true extruded solid (`startTokenLayer` draws it); the `<Chip dieCut>` inside is its flat form, shown until the solid is drawn and wherever WebGL is not. Size = `mm` x `pxPerMm`; `recess` (K720, mm): a round hollow in the front face; `tilt`, `turn`, `spin` in radians (turn Math.PI shows the back). */
export function Token({ src, back, mm, pxPerMm, edge, tilt, turn, spin, recess, alt = '', className }: { recess?: Recess | undefined; src: string; back?: string | undefined; mm: TokenMm; pxPerMm: number; edge?: string | undefined; tilt?: number | undefined; turn?: number | undefined; spin?: number | undefined; alt?: string; className?: string | undefined }) {
  const { w, h, d } = tokenSize(mm, pxPerMm);
  return (
    <span data-p3-token="" data-src={src} data-back={back} data-edge={edge} data-recess={recess ? [recess.d, recess.depth, recess.x ?? 0, recess.y ?? 0, recess.floor ?? 0.8, recess.segs ?? 64].map((v, i) => String(i < 4 ? v * pxPerMm : v)).join() : undefined} data-size={`${String(w)},${String(h)},${String(d)}`} data-rot={tilt === undefined && !turn && !spin ? undefined : `${tilt === undefined ? '' : String(tilt)},${String(turn ?? 0)},${String(spin ?? 0)}`} className={className} style={{ width: w, height: h, '--chip-thickness': `${String(d)}px` } as React.CSSProperties}>
      <Chip dieCut src={src} alt={alt} {...(tilt === undefined ? {} : { tilt: `${String((tilt * 180) / Math.PI)}deg` })} style={{ width: w, height: h }} />
    </span>
  );
}
