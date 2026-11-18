// "Export all data" and "Reset all data": everything the app keeps in the browser. The game lists its localStorage keys
// and its other stores (IndexedDB tables: `saves.data`, imported packs). Storage that refuses reads as empty.
import { downloadText } from '../small-helpers/download.ts';

export interface AllDataConfig {
  /** The export's `format` field and the start of its file name (`<format>-YYYY-MM-DD.json`). */
  readonly format: string;
  /** The localStorage keys the app stores: a whole key, or a prefix ending in `*` (`mygame.*`). */
  readonly keys: readonly string[];
  /** Other stores by name: what the export shows of each, and how the reset empties it. */
  readonly stores?: Readonly<Record<string, { read: () => Promise<unknown>; clear: () => Promise<void>; write?: (value: unknown) => Promise<void> }>>;
  /** Default: the page's localStorage. */
  readonly storage?: Pick<Storage, 'length' | 'key' | 'getItem' | 'removeItem'> & Partial<Pick<Storage, 'setItem'>>;
}

function listed(cfg: AllDataConfig, k: string): boolean {
  return cfg.keys.some((p) => (p.endsWith('*') ? k.startsWith(p.slice(0, -1)) : k === p));
}

function localKeys(cfg: AllDataConfig): string[] {
  try {
    const s = cfg.storage ?? globalThis.localStorage;
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null && listed(cfg, k)) out.push(k);
    }
    return out.sort();
  } catch {
    return [];
  }
}

/** What "Export all data" writes: each listed key's string exactly as stored, and each store's `read()`. */
export async function allData(cfg: AllDataConfig, exportedAt = new Date().toISOString()): Promise<Record<string, unknown>> {
  const local: Record<string, unknown> = {};
  for (const k of localKeys(cfg)) {
    try {
      const text = (cfg.storage ?? globalThis.localStorage).getItem(k);
      if (text !== null) local[k] = text;
    } catch {
      /* unreadable: left out */
    }
  }
  const stores: Record<string, unknown> = {};
  for (const [name, s] of Object.entries(cfg.stores ?? {})) stores[name] = await s.read().catch(() => null);
  return { format: cfg.format, version: 1, exportedAt, localStorage: local, stores };
}

/** Download the export as `<format>-YYYY-MM-DD.json`. False when the browser refuses. */
export async function exportAllData(cfg: AllDataConfig, download: (text: string, name: string) => boolean = downloadText): Promise<boolean> {
  const data = await allData(cfg);
  return download(`${JSON.stringify(data, null, 2)}\n`, `${cfg.format}-${String(data['exportedAt']).slice(0, 10)}.json`);
}

/** Remove every listed key and empty every store. Put the stores in memory back to their defaults first (they write their keys again). */
export async function resetAllData(cfg: AllDataConfig): Promise<void> {
  for (const k of localKeys(cfg)) {
    try {
      (cfg.storage ?? globalThis.localStorage).removeItem(k);
    } catch {
      /* nothing kept */
    }
  }
  for (const s of Object.values(cfg.stores ?? {})) await s.clear().catch(() => undefined);
}

/**
 * Read back what `exportAllData` wrote. Listed keys in the file are written as the stored strings (unlisted keys ignored; listed keys
 * absent from the file are left alone); each store with `write` that is in the file gets its value (null, an unreadable store at export, is skipped). A failing write is skipped.
 */
export async function importAllData(
  cfg: AllDataConfig,
  text: string,
): Promise<{ ok: true } | { ok: false; reason: 'unreadable' | 'wrong-format' | 'newer-version' }> {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(text) as Record<string, unknown>;
    if (d === null || typeof d !== 'object' || Array.isArray(d)) return { ok: false, reason: 'unreadable' };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (d['format'] !== cfg.format) return { ok: false, reason: 'wrong-format' };
  if (typeof d['version'] !== 'number' || d['version'] > 1) return { ok: false, reason: 'newer-version' };
  const local = d['localStorage'];
  if (local !== null && typeof local === 'object') {
    for (const [k, v] of Object.entries(local)) {
      if (typeof v !== 'string' || !listed(cfg, k)) continue;
      try {
        (cfg.storage ?? globalThis.localStorage).setItem?.(k, v);
      } catch {
        /* refused: skipped */
      }
    }
  }
  const stores = d['stores'];
  if (stores !== null && typeof stores === 'object') {
    for (const [name, s] of Object.entries(cfg.stores ?? {})) {
      const v = (stores as Record<string, unknown>)[name];
      if (s.write && v !== undefined && v !== null) {
        try {
          await s.write(v);
        } catch {
          /* skipped */
        }
      }
    }
  }
  return { ok: true };
}
