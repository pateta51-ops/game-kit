// A key-value table in IndexedDB (idb-keyval). If IndexedDB refuses (a private window), the values last until the page
// closes (a memory copy). The memory copy holds a value until IndexedDB confirms it: `get` reads it first (it is the
// newest), and a confirmed write drops it only while it is still that write's value, so an older write that lands late
// never deletes a newer copy (two overlapping puts on one key).
import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';


export interface Kv<T> {
  all(): Promise<[string, T][]>;
  get(key: string): Promise<T | undefined>;
  put(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

/** The IndexedDB calls a Kv makes (tests replace them to order or fail the writes). */
export interface KvBackend {
  entries(store: UseStore): Promise<[IDBValidKey, unknown][]>;
  get(key: string, store: UseStore): Promise<unknown>;
  set(key: string, value: unknown, store: UseStore): Promise<void>;
  del(key: string, store: UseStore): Promise<void>;
}

const IDB: KvBackend = { entries, get, set, del };

export function makeKv<T>(database: string, table: string, backend: KvBackend = IDB): Kv<T> {
  let store: UseStore | null = null;
  const memory = new Map<string, T>();
  const db = (): UseStore => (store ??= createStore(database, table));
  return {
    async all() {
      const out = new Map<string, T>();
      try {
        for (const [k, v] of await backend.entries(db()))
          out.set(typeof k === 'string' ? k : JSON.stringify(k), v as T);
      } catch {
        /* the memory copy stands */
      }
      for (const [k, v] of memory) out.set(k, v);
      return [...out.entries()];
    },
    async get(key) {
      if (memory.has(key)) return memory.get(key);
      try {
        return (await backend.get(key, db())) as T | undefined;
      } catch {
        return undefined;
      }
    },
    async put(key, value) {
      memory.set(key, value);
      try {
        await backend.set(key, value, db());
        // only this write's own copy: a newer put on the same key keeps its copy until it is confirmed
        if (memory.get(key) === value) memory.delete(key);
      } catch {
        /* kept in memory */
      }
    },
    async remove(key) {
      memory.delete(key);
      try {
        await backend.del(key, db());
      } catch {
        /* nothing stored */
      }
    },
  };
}
