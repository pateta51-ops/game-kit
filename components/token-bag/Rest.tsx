// Port of Warp's Edge Bag3dRest.tsx: the 3D bag at rest in the dock. It renders a frame when ready and when resized,
// never in a loop. Reached only by a dynamic import (TokenBag.tsx), so a game's main bundle carries no three.js.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createBagScene } from './scene.ts';
import type { Exterior } from './exterior.ts';
import type { FallbackReason } from './mode.ts';

export interface RestProps {
  faceUrl: (kind: string) => string;
  exterior?: Exterior | undefined;
  backdrop?: string | undefined;
  onFail: (reason: FallbackReason) => void;
}

export function Rest({ faceUrl, exterior, backdrop, onFail }: RestProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cb = useRef(onFail);
  useLayoutEffect(() => {
    cb.current = onFail;
  });
  useEffect(() => {
    const el = canvas.current;
    if (el === null) return;
    let alive = true;
    const fail = (reason: FallbackReason): void => {
      if (alive) cb.current(reason);
    };
    let s: ReturnType<typeof createBagScene>;
    try {
      s = createBagScene(el, {
        view: 'rest',
        contents: [],
        drawn: [],
        faceUrl,
        ...(exterior === undefined ? {} : { exterior }),
        ...(backdrop === undefined ? {} : { backdrop }),
        onLost: () => fail('error'),
        onError: () => fail('error'),
      });
    } catch {
      fail('error');
      return;
    }
    s.ready.then(
      () => {
        if (alive) el.dataset.ready = '';
      },
      () => fail('error'),
    );
    return () => {
      alive = false;
      s.dispose();
    };
    // one scene per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={canvas} data-part="token-bag-canvas" aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%' }} />;
}
