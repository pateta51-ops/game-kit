// Port of Warp's Edge Bag3dDraw.tsx: the shake-and-draw over the page for one real draw. `contents` is the bag before
// the draw, `drawn` the engine's drawn tokens in draw order. The engine has drawn already; the scene only shows it and
// never waits the game. Starts from the dock's bag in place (the camera pulls back, the backdrop fades in), the drawn
// tokens land face up in a row, any tap or key skips to the end. Reports a failure so the dock falls back to 2D.
// Reached only by a dynamic import (TokenBag.tsx).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createBagScene, ZOOM_BACK, type BagScene, type FrameStats } from './scene.ts';
import type { Exterior } from './exterior.ts';
import { dockCanvas, type FallbackReason } from './mode.ts';

export interface DrawProps {
  contents: readonly string[];
  drawn: readonly string[];
  faceUrl: (kind: string) => string;
  exterior?: Exterior | undefined;
  backdrop?: string | undefined;
  /** the scene's rate (1 = as approved; 2 = twice as fast) */
  rate: number;
  countLabel: string;
  skipText: string;
  onDone: () => void;
  onFail: (reason: FallbackReason) => void;
}

// Hides every dock bag while a draw plays, found whenever it is shown (the game may mount a new dock mid-draw); the
// count and hint keep clear of the notch and grow with the screen. e2e hooks: window.__bag3dStats / __bag3dSeek.
const STYLE = `html.token-bag-drawing canvas[data-part="token-bag-canvas"]{visibility:hidden}
[data-part="token-bag-draw"] [data-part="token-bag-count"]{top:max(16px,env(safe-area-inset-top))}
[data-part="token-bag-draw"] [data-part="token-bag-n"]{font-size:clamp(34px,3.2vmin,96px)}
[data-part="token-bag-draw"] [data-part="token-bag-label"]{font-size:clamp(12px,1.2vmin,36px)}
[data-part="token-bag-draw"] [data-part="token-bag-skip"]{bottom:max(16px,env(safe-area-inset-bottom));font-size:clamp(15px,1.4vmin,40px)}`;

interface Hooks {
  __bag3dStats?: () => FrameStats & { faceSize: number; textureBytes: number };
  __bag3dSeek?: (t: number) => void;
}

type Phase = 'loading' | 'playing' | 'done' | 'back';

export function Draw({ contents, drawn, faceUrl, exterior, backdrop, rate, countLabel, skipText, onDone, onFail }: DrawProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [count, setCount] = useState(contents.length);
  const [phase, setPhase] = useState<Phase>('loading');
  const cb = useRef({ onDone, onFail });
  useLayoutEffect(() => {
    cb.current = { onDone, onFail };
  });

  useEffect(() => {
    const el = canvas.current;
    if (el === null) return;
    let s: BagScene;
    let alive = true;
    let closing = 0;
    // the dock's bag hides while this one plays from its place, and shows again as this one returns to it
    const hideDock = (hide: boolean): void => {
      document.documentElement.classList.toggle('token-bag-drawing', hide);
    };
    if (document.getElementById('token-bag-draw-style') === null) {
      const st = document.createElement('style');
      st.id = 'token-bag-draw-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    const from = (): DOMRect | null => dockCanvas()?.getBoundingClientRect() ?? null;
    const at = from();
    hideDock(true);
    try {
      s = createBagScene(el, {
        contents,
        drawn,
        rate,
        faceUrl,
        ...(exterior === undefined ? {} : { exterior }),
        ...(backdrop === undefined ? {} : { backdrop }),
        onCount: setCount,
        from: () => at !== null ? from() : null,
        onDone: () => {
          if (!alive) return;
          setPhase('done');
          closing = window.setTimeout(() => {
            if (!alive) return;
            setPhase('back');
            hideDock(false);
            const end = (): void => {
              if (alive) cb.current.onDone();
            };
            s.back().then(end, end);
          }, 450 / rate);
        },
        onSlow: () => {
          if (alive) cb.current.onFail('slow');
        },
        onLost: () => {
          if (alive) cb.current.onFail('error');
        },
        onError: () => {
          if (alive) cb.current.onFail('error');
        },
      });
    } catch {
      hideDock(false);
      cb.current.onFail('error');
      return;
    }
    const w = window as unknown as Hooks;
    w.__bag3dStats = () => ({ ...s.stats(), faceSize: s.faceSize, textureBytes: s.textureBytes });
    w.__bag3dSeek = (t: number) => s.seek(t);
    s.ready.then(
      () => {
        if (!alive) return;
        setPhase('playing');
        s.play();
      },
      () => {
        if (alive) cb.current.onFail('error');
      },
    );
    return () => {
      alive = false;
      window.clearTimeout(closing);
      hideDock(false);
      delete w.__bag3dStats;
      delete w.__bag3dSeek;
      s.dispose();
    };
    // one scene per draw: the parent keys this component by the draw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // any key skips the draw (a tap: onPointerDown): the overlay closes at once, without rendering again, so a broken
  // renderer can never keep it over the table; the drawn tokens are already in the game's view
  useEffect(() => {
    const skip = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
      cb.current.onDone();
    };
    window.addEventListener('keydown', skip, true);
    return () => window.removeEventListener('keydown', skip, true);
  }, []);

  return (
    <div
      data-part="token-bag-draw"
      data-phase={phase}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        cursor: 'pointer',
        ...(phase === 'back' ? { opacity: 0, transition: `opacity ${String(ZOOM_BACK / rate)}s ease-in` } : {}),
      }}
      role="dialog"
      aria-label="Drawing from the bag"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        cb.current.onDone();
      }}
    >
      <canvas ref={canvas} data-part="token-bag-scene" style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }} />
      <div data-part="token-bag-count" aria-label={`${String(count)} ${countLabel}`} style={{ position: 'absolute', top: 16, left: 16, pointerEvents: 'none' }}>
        <span data-part="token-bag-n">{count}</span> <span data-part="token-bag-label">{countLabel}</span>
      </div>
      <p data-part="token-bag-skip" style={{ position: 'absolute', left: 16, right: 16, bottom: 16, margin: 0, textAlign: 'center' }}>{skipText}</p>
    </div>
  );
}
