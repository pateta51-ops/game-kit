export type Theme = 'light' | 'dark' | 'system';

export const nextTheme: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };

export function createThemeStore(key: string, fallback: Theme = 'system', attr = 'data-theme') {
  const listeners = new Set<() => void>();
  let theme = fallback;
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark' || saved === 'system') theme = saved;
  } catch {
    // Storage may be unavailable.
  }

  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function apply() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute(attr, theme);
    root.setAttribute(`${attr}-resolved`, theme === 'system' ? (mq?.matches ? 'dark' : 'light') : theme);
  }

  function setTheme(value: Theme) {
    theme = value;
    apply();
    try {
      localStorage.setItem(key, theme);
    } catch {
      // Keep the in-memory choice.
    }
    for (const listener of listeners) listener();
  }

  apply();
  mq?.addEventListener('change', apply);
  return {
    destroy: () => mq?.removeEventListener('change', apply),
    getTheme: () => theme,
    setTheme,
    cycle: () => setTheme(nextTheme[theme]),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function disclaimer(gameName: string, publisher: string): string {
  return `Unofficial fan project based on ${gameName}. This project is unaffiliated with ${publisher}.`;
}
