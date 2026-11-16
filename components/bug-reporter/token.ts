// Bug reports: the GitHub token. It lives only in this device's browser storage (`localStorage["<id>:github-token:v1"]`,
// a key of its own: not in the settings object, a save, a report, a log, an export or a URL), is sent only by
// `browserTransport` (github.ts) in the Authorization header to api.github.com, and shows in Settings as "saved" without
// any of its characters. `forget` removes it. Storage can refuse: then the token lasts until the page closes.
import { create } from 'zustand';
import { bugConfig } from './config.ts';
import { safeStorage } from './storage.ts';

export const tokenKey = (): string => `${bugConfig().id}:github-token:v1`;

interface TokenState {
  /** Whether a token is stored (the token itself is read only by `readToken`). */
  has: boolean;
  /** Keep a token. False when it is empty or has white space in it. */
  save: (token: string) => boolean;
  forget: () => void;
}

let held: string | null = null;

/** The token, for the one call that sends it; null when there is none. */
export function readToken(): string | null {
  return held ?? safeStorage.getItem(tokenKey());
}

let read = false;
// Storage (and the game's id) is read on first use, not at import: a game may import this before configureBugReporter.
const sync = (): void => {
  if (read) return;
  const has = readToken() !== null;
  read = true;
  // In place: nobody has read or subscribed yet (every entry below syncs first), so nothing is notified, even in a render.
  store.getState().has = has;
};

const store = create<TokenState>((set) => ({
  has: false,
  save: (token) => {
    const clean = token.trim();
    if (clean === '' || /\s/.test(clean)) return false;
    read = true;
    held = clean;
    safeStorage.setItem(tokenKey(), clean);
    set({ has: true });
    return true;
  },
  forget: () => {
    read = true;
    held = null;
    safeStorage.removeItem(tokenKey());
    set({ has: false });
  },
}));

const hook = (selector?: (s: TokenState) => unknown): unknown => (sync(), selector ? store(selector) : store());
export const useToken = Object.assign(hook as unknown as typeof store, store, {
  getState: (): TokenState => (sync(), store.getState()),
  setState: ((partial: never, replace?: never) => (sync(), store.setState(partial, replace))) as typeof store.setState,
  subscribe: (listener: Parameters<typeof store.subscribe>[0]): (() => void) => (sync(), store.subscribe(listener)),
});
