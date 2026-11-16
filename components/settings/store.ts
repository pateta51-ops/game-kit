// A zustand store of one schema's values, persisted under schema.storageKey. Storage that is missing or refuses a
// write (a private window, blocked site data) is not an error: the values last for the session.
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { defaults, readSettings, type SettingsSchema, type Values } from './schema.ts';

export const safeStorage: StateStorage = {
  getItem: (n) => {
    try {
      return window.localStorage.getItem(n);
    } catch {
      return null;
    }
  },
  setItem: (n, v) => {
    try {
      window.localStorage.setItem(n, v);
    } catch {
      /* unavailable */
    }
  },
  removeItem: (n) => {
    try {
      window.localStorage.removeItem(n);
    } catch {
      /* unavailable */
    }
  },
};

export interface SettingsState<V> {
  values: V;
  set: <K extends keyof V>(key: K, value: V[K]) => void;
  /** The given keys (all when none) back to their defaults. */
  reset: (keys?: readonly (keyof V)[]) => void;
}

export function createSettingsStore<S extends SettingsSchema>(schema: S, storage: StateStorage = safeStorage) {
  const d = defaults(schema);
  return create<SettingsState<Values<S>>>()(
    persist(
      (set) => ({
        values: d,
        set: (key, value) => {
          set((s) => ({ values: { ...s.values, [key]: value } }));
        },
        reset: (keys) => {
          set((s) => {
            const values = { ...s.values };
            for (const k of keys ?? Object.keys(d)) values[k] = d[k];
            return { values };
          });
        },
      }),
      {
        name: schema.storageKey,
        version: schema.version ?? 1,
        storage: createJSONStorage(() => storage),
        partialize: (s) => ({ values: s.values }),
        migrate: (p) => p,
        merge: (p, current) => ({
          ...current,
          values: readSettings(schema, (p as { values?: unknown } | null | undefined)?.values),
        }),
      },
    ),
  );
}

export type SettingsStore<S extends SettingsSchema> = ReturnType<typeof createSettingsStore<S>>;
