// Bug reports: the GitHub token. It lives only in this device's browser storage (`localStorage["<id>:github-token:v1"]`,
// a key of its own: not in the settings object, a save, a report, a log, an export or a URL), is sent only by
// `browserTransport` (github.ts) in the Authorization header to api.github.com, and shows in Settings as "saved" without
// any of its characters. `forget` removes it. Storage can refuse: then the token lasts until the page closes.
import { create } from 'zustand';
import { bugConfig } from './config';
import { safeStorage } from './storage';

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

export const useToken = create<TokenState>((set) => ({
  has: readToken() !== null,
  save: (token) => {
    const clean = token.trim();
    if (clean === '' || /\s/.test(clean)) return false;
    held = clean;
    safeStorage.setItem(tokenKey(), clean);
    set({ has: true });
    return true;
  },
  forget: () => {
    held = null;
    safeStorage.removeItem(tokenKey());
    set({ has: false });
  },
}));
