// Port of Warp's Edge BagDock.tsx + BagView.tsx (generalised): the bag with its count, in 3D or 2D, and the draw shown
// as a 3D shake-and-draw that never decides the draw. The dock is the `[data-bag]` / `[data-place]` anchor that
// token-flights leave from in 2D. The 3D side is loaded by dynamic import so a game's main bundle has no three.js.
import { lazy, Suspense, useEffect, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { bagMode, drawContents, getFallback, hasWebgl, rateFor, setFallback, subscribeFallback, type FallbackReason } from './mode.ts';
import type { Exterior } from './exterior.ts';
import type { RestProps } from './Rest.tsx';
import type { DrawProps } from './Draw.tsx';

/** The 3D chunk failed to load (offline before it was cached): fall back to 2D. */
function Failed({ onFail }: { onFail: (r: FallbackReason) => void }) {
  useEffect(() => onFail('error'), [onFail]);
  return null;
}

const Rest = lazy((): Promise<{ default: ComponentType<RestProps> }> =>
  import('./Rest.tsx').then((m) => ({ default: m.Rest }), () => ({ default: Failed })),
);
const Draw = lazy((): Promise<{ default: ComponentType<DrawProps> }> =>
  import('./Draw.tsx').then((m) => ({ default: m.Draw }), () => ({ default: Failed })),
);

/** One draw to show: `left` is the view's unordered contents after the draw, `drawn` the tokens in draw order. */
export interface BagDraw {
  key: string | number;
  left: readonly string[];
  drawn: readonly string[];
}

export interface TokenBagProps {
  /** the bag's count, shown under the bag */
  count: number;
  /** the player's choice (settings); 3D still falls back to 2D for the session when it cannot run */
  chosen: '2d' | '3d';
  /** the image of a token kind: the coin's face */
  faceUrl: (kind: string) => string;
  /** the game's print on the cloth (default: plain cloth) */
  exterior?: Exterior;
  backdrop?: string;
  /** set window.__bag3dStats / __bag3dSeek while a draw plays, for e2e (default off) */
  e2eHooks?: boolean;
  /** the settings' factor (1 normal, 2 slow, 0 none: no scene) */
  speed: number;
  /** default `prefers-reduced-motion` */
  reduced?: () => boolean;
  /** the draw to show now; the game sets it when an answer drew and clears it in `onDrawDone` */
  draw: BagDraw | null;
  /** the draw is over, skipped, or cannot be shown in 3D (2D mode, speed 0, reduced motion, a failure): the game's flights show it */
  onDrawDone: (key: string | number) => void;
  /** the `data-place` of the dock (default `bag`) */
  place?: string;
  label?: string;
  countLabel?: string;
  skipText?: string;
  /** the 2D bag's face; default is the count */
  children?: ReactNode;
}

const prefersReduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function TokenBag(p: TokenBagProps) {
  const fb = useSyncExternalStore(subscribeFallback, getFallback, getFallback);
  const mode = bagMode(p.chosen, fb);
  useEffect(() => {
    if (p.chosen === '3d' && getFallback() === null && !hasWebgl()) setFallback('no-webgl');
  }, [p.chosen]);
  const rate = rateFor(p.speed, (p.reduced ?? prefersReduced)());
  const play = p.draw !== null && mode === '3d' && rate > 0;
  const done = useRef(p.onDrawDone);
  useEffect(() => {
    done.current = p.onDrawDone;
  });
  const key = p.draw?.key;
  useEffect(() => {
    if (key !== undefined && !play) done.current(key);
  }, [key, play]);
  const label = p.label ?? `Bag: ${String(p.count)} tokens`;
  const count = <span data-part="token-bag-count"><b data-part="token-bag-n">{p.count}</b></span>;
  return (
    <>
      <div data-part="token-bag" data-bag="" data-place={p.place ?? 'bag'} data-mode={mode} data-fallback={fb ?? ''} aria-label={label}>
        {mode === '3d' && hasWebgl() ? (
          <>
            <Suspense fallback={<span data-part="token-bag-canvas" />}>
              <Rest faceUrl={p.faceUrl} exterior={p.exterior} backdrop={p.backdrop} onFail={setFallback} />
            </Suspense>
            {count}
          </>
        ) : (
          (p.children ?? count)
        )}
      </div>
      {play && p.draw !== null ? (
        <Suspense fallback={null}>
          <Draw
            key={p.draw.key}
            contents={drawContents(p.draw.left, p.draw.drawn)}
            drawn={p.draw.drawn}
            faceUrl={p.faceUrl}
            exterior={p.exterior}
            backdrop={p.backdrop}
            e2eHooks={p.e2eHooks}
            rate={rate}
            countLabel={p.countLabel ?? 'in the bag'}
            skipText={p.skipText ?? 'Tap to skip'}
            onDone={() => done.current(p.draw?.key ?? 0)}
            onFail={(r) => {
              setFallback(r);
              done.current(p.draw?.key ?? 0);
            }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
