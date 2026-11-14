// A stand-in game for the tests: a snapshot store, a "Bug report button" setting and a route flag.
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { configureBugReporter } from './config';

export const useTestGame = create<{ round: number | null }>(() => ({ round: null }));
export const startTestGame = (): void => useTestGame.setState({ round: 1 });
export const stopTestGame = (): void => useTestGame.setState({ round: null });
export const useTestSettings = create<{ bugButton: 'auto' | 'on' | 'off' }>(() => ({ bugButton: 'auto' }));

const hash = (cb: () => void): (() => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

configureBugReporter({
  id: 'test',
  repo: { owner: 'test-owner', repo: 'test-repo' },
  buildSha: 'abc123',
  snapshot: () => {
    const round = useTestGame.getState().round;
    return {
      contentHash: round === null ? null : 'hash',
      replay: round === null ? null : { saveVersion: 1 },
      theme: 'light',
      round,
      prompt: null,
      actions: 0,
      log: round === null ? [] : ['R1.1 started'],
    };
  },
  useButtonMode: () => useTestSettings((s) => s.bugButton),
  useHideFloatingButton: () => useSyncExternalStore(hash, () => window.location.hash === '#/game'),
  markupFont: 'sans-serif',
  fonts: () => [],
});
