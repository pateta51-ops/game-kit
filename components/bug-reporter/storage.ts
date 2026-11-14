// localStorage that never throws (a private window or blocked site data): the token falls back to memory (token.ts).
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* memory fallback in token.ts */
    }
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* unavailable */
    }
  },
};
