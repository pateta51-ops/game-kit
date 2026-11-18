// K372: the React side. Starts once per store (the guard survives StrictMode's double effect) and stops on unmount.
import { useEffect } from 'react';
import type { GameTypes } from '../engine-core/index.ts';
import type { GameStore } from '../game-store/index.ts';
import { devAutoplay, type AutoplayHandle, type AutoplayOptions } from './index.ts';

const running = new WeakMap<object, { h: AutoplayHandle; t?: ReturnType<typeof setTimeout> | undefined }>();

export function useDevAutoplay<G extends GameTypes, V>(store: GameStore<G, V>, o: AutoplayOptions<G, V>): void {
  useEffect(() => {
    let e = running.get(store);
    if (e?.t !== undefined) { clearTimeout(e.t); e.t = undefined; }
    else if (e === undefined) { e = { h: devAutoplay(store, o) }; running.set(store, e); }
    const mine = e;
    return () => { mine.t = setTimeout(() => { mine.h.stop(); running.delete(store); }, 0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
}
