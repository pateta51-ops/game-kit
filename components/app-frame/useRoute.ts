// The route of the address bar (re-read on hashchange) and the frame's own words.
import { useSyncExternalStore } from 'react';
import { parseHash, type Route } from './routes.ts';

export interface FrameWords {
  loading: string;
  failed: string;
  retry: string;
  home: string;
}

export const FRAME_WORDS: FrameWords = {
  loading: 'Loading…',
  failed: 'This screen could not be drawn.',
  retry: 'Try again',
  home: 'Home',
};

const subscribe = (f: () => void): (() => void) => {
  window.addEventListener('hashchange', f);
  return () => {
    window.removeEventListener('hashchange', f);
  };
};
const hashNow = (): string => window.location.hash;

export function useRoute<N extends string>(names: readonly N[], home: N): Route<N> {
  return parseHash(useSyncExternalStore(subscribe, hashNow, () => ''), names, home);
}

