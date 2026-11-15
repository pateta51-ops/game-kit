// Saved games in IndexedDB over engine-core's SaveFile: autosave slots written after every action (the newest `autosaves`
// kept, older ones pruned), named saves, export and import as JSON text. Loading replays the save (restoreSave), so a
// save from another build says so and can only be deleted. The database name and the export file prefix come from the game.
import {
  createSave,
  DEFAULT_SAVE_FORMAT,
  exportSave,
  importSave,
  restoreSave,
  type GameRules,
  type GameTypes,
  type History,
  type RestoreResult,
  type SaveFile,
  type SaveFormat,
} from '../engine-core';
import { makeKv, type KvBackend } from './kv';

export interface StoredSave<G extends GameTypes> {
  readonly name: string;
  readonly save: SaveFile<G>;
}

export interface SavesConfig<G extends GameTypes> {
  readonly game: GameRules<G>;
  readonly content: G['content'];
  readonly format?: SaveFormat;
  /** IndexedDB database name, one per game. */
  readonly database: string;
  /** Table in it (default `saves`). */
  readonly table?: string;
  /** Autosave slots kept, newest first (default 1). */
  readonly autosaves?: number;
  /** Start of an export's file name (`<prefix>-<YYYY-MM-DD-HH-MM>.json`). */
  readonly filePrefix: string;
  readonly now?: () => Date;
  readonly backend?: KvBackend;
}

export const AUTO = 'auto:';
export const NAMED = 'named:';

export type Saves<G extends GameTypes> = ReturnType<typeof makeSaves<G>>;

export function makeSaves<G extends GameTypes>(cfg: SavesConfig<G>) {
  const kv = makeKv<StoredSave<G>>(cfg.database, cfg.table ?? 'saves', cfg.backend);
  const format = cfg.format ?? DEFAULT_SAVE_FORMAT;
  const keep = Math.max(1, cfg.autosaves ?? 1);
  const now = cfg.now ?? (() => new Date());
  let seq = 0;
  const stamp = (): string =>
    `${now().getTime().toString(36).padStart(10, '0')}${(seq++ % 1e6).toString(36).padStart(4, '0')}`;
  const newest = (a: [string, StoredSave<G>], b: [string, StoredSave<G>]): number =>
    b[1].save.savedAt.localeCompare(a[1].save.savedAt) || (b[0] < a[0] ? -1 : b[0] > a[0] ? 1 : 0);
  const list = async (prefix: string): Promise<[string, StoredSave<G>][]> =>
    (await kv.all()).filter(([k]) => k.startsWith(prefix)).sort(newest);

  /** The save of a history: the actions up to the cursor (an undone tail is not saved). Throws on a broken game. */
  const saveOf = (h: History<G>): SaveFile<G> =>
    createSave(
      cfg.game,
      { options: h.options, rules: h.rules, actions: h.actions.slice(0, h.cursor), undoUsed: h.undoUsed, savedAt: now().toISOString() },
      cfg.content,
      format,
    );

  const listAutosaves = (): Promise<[string, StoredSave<G>][]> => list(AUTO);

  return {
    saveOf,
    /** The history a save loads as (the cursor at the end). */
    historyOf: (save: SaveFile<G>): History<G> => ({
      options: save.options,
      rules: save.rules,
      actions: save.actions,
      cursor: save.actions.length,
      undoUsed: save.undoUsed,
    }),
    /** Write a new autosave slot named `name`, then delete the slots past the newest `autosaves`. Returns its key. */
    async writeAutosave(h: History<G>, name: string): Promise<string> {
      const key = AUTO + stamp();
      await kv.put(key, { name, save: saveOf(h) });
      for (const [k] of (await listAutosaves()).slice(keep)) await kv.remove(k);
      return key;
    },
    listAutosaves,
    /** The newest autosave. */
    readAutosave: async (): Promise<[string, StoredSave<G>] | undefined> => (await listAutosaves())[0],
    async clearAutosaves(): Promise<void> {
      for (const [k] of await listAutosaves()) await kv.remove(k);
    },
    async saveNamed(name: string, h: History<G>): Promise<string> {
      const key = NAMED + stamp();
      await kv.put(key, { name, save: saveOf(h) });
      return key;
    },
    /** Store an imported save file's text as a named save; the reason when it does not load. */
    async importNamed(text: string, name: string): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
      const r = importSave(cfg.game, text, cfg.content, format);
      if (!r.ok) return { ok: false, error: r.error };
      const key = NAMED + stamp();
      await kv.put(key, { name, save: r.save });
      return { ok: true, key };
    },
    /** Every named save, newest first. */
    listNamed: (): Promise<[string, StoredSave<G>][]> => list(NAMED),
    get: (key: string): Promise<StoredSave<G> | undefined> => kv.get(key),
    remove: (key: string): Promise<void> => kv.remove(key),
    exportText: (s: StoredSave<G>): string => exportSave(s.save),
    exportName: (s: StoredSave<G>): string =>
      `${cfg.filePrefix}-${s.save.savedAt.slice(0, 16).replace(/[:T]/g, '-')}.json`,
    /** Replay a stored save: its state, or why it cannot load (never throws). */
    restore: (s: StoredSave<G>): RestoreResult<G> => restoreSave(cfg.game, s.save, cfg.content, format),
  };
}

/** Ask the browser to keep this site's storage (a home-screen app may lose it otherwise). True when it is kept. */
export async function keepStorage(storage: StorageManager | undefined = globalThis.navigator?.storage): Promise<boolean> {
  try {
    if (storage === undefined) return false;
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    return typeof storage.persist === 'function' ? await storage.persist() : false;
  } catch {
    return false;
  }
}
