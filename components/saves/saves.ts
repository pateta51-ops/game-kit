// Saved games in IndexedDB over engine-core's SaveFile: autosave slots written after every action (the newest `autosaves`
// kept, older ones pruned), named saves, export and import as JSON text. Loading replays the save (restoreSave), so a
// save from another build says so and can only be deleted. The database name and the export file prefix come from the game.
import {
  applyAction,
  createGame,
  createSave,
  DEFAULT_SAVE_FORMAT,
  exportSave,
  importSave,
  restoreSave,
  sealOf,
  UNKNOWN_COMMIT,
  type EnginePort,
  type GameRules,
  type GameTypes,
  type History,
  type RestoreResult,
  type SaveFile,
  type SaveFormat,
} from '../engine-core/index.ts';
import { isPort, portHash, portRestore, portStart, portStep } from './port.ts';
import { makeKv, type KvBackend } from './kv.ts';

export interface StoredSave<G extends GameTypes> {
  readonly name: string;
  readonly save: SaveFile<G>;
}

export interface SavesConfig<G extends GameTypes> {
  /** A `GameRules`, or an engine-core `EnginePort` (K403: the save holds seed, content hash and answers). */
  readonly game: GameRules<G> | EnginePort<G>;
  /** The content hash a port save carries (default: engine-core's hashValue of the content). Rules games use their own. */
  readonly contentHash?: (content: G['content']) => string;
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
  /** A failed autosave write (the save then lasts in memory for the page). Default: one console warning. */
  readonly onError?: (e: unknown) => void;
}

export const AUTO = 'auto:';
export const NAMED = 'named:';
/** The key of the last autosave's time (ms), outside the `auto:` and `named:` spaces so no listing takes it for a save. */
export const SAVE_CLOCK = 'save-clock';
/** A stored clock further ahead of now than this is ignored (a clock once wrong must not pin every later autosave to a future date). */
export const SAVE_CLOCK_MAX_AHEAD_MS = 24 * 60 * 60 * 1000;
const isTime = (t: unknown): t is number => typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= 8.64e15;

export type Saves<G extends GameTypes> = ReturnType<typeof makeSaves<G>>;

export function makeSaves<G extends GameTypes>(cfg: SavesConfig<G>) {
  const game = cfg.game;
  const port = isPort(game) ? game : undefined;
  const rules = isPort(game) ? undefined : game;
  const kv = makeKv<StoredSave<G>>(cfg.database, cfg.table ?? 'saves', cfg.backend, cfg.onError);
  const format = cfg.format ?? DEFAULT_SAVE_FORMAT;
  const keep = Math.max(1, cfg.autosaves ?? 1);
  const now = cfg.now ?? (() => new Date());
  let seq = 0;
  const stamp = (t = now().getTime()): string =>
    `${t.toString(36).padStart(10, '0')}${(seq++ % 1e6).toString(36).padStart(4, '0')}`;
  const newest = (a: [string, StoredSave<G>], b: [string, StoredSave<G>]): number =>
    b[1].save.savedAt.localeCompare(a[1].save.savedAt) || (b[0] < a[0] ? -1 : b[0] > a[0] ? 1 : 0);
  const list = async (prefix: string): Promise<[string, StoredSave<G>][]> =>
    (await kv.all()).filter(([k]) => k.startsWith(prefix)).sort(newest);

  // The state at the cursor of the last history saved; a history that extends it applies only the new actions (K266).
  let live: { options: G['options']; rules: G['rules']; actions: readonly G['action'][]; state: G['state'] } | undefined;
  const stateOf = (h: History<G>, actions: readonly G['action'][]): G['state'] => {
    const c = live;
    let state: G['state'];
    let at = 0;
    if (c && c.options === h.options && c.rules === h.rules && c.actions.length <= actions.length && c.actions.every((a, i) => a === actions[i])) {
      state = c.state;
      at = c.actions.length;
    } else state = port ? portStart(port, (h.options as { seed: string }).seed) : createGame(rules!, h.options, h.rules, cfg.content).state;
    for (; at < actions.length; at++) state = port ? portStep(port, state, actions[at] as G['action']) : applyAction(rules!, state, actions[at] as G['action'], cfg.content).state;
    live = { options: h.options, rules: h.rules, actions, state };
    return state;
  };
  /** The save of a history: the actions up to the cursor (an undone tail is not saved). Throws on a broken game. */
  const fileOf = (h: History<G>, savedAt: string): SaveFile<G> => {
    const actions = h.actions.slice(0, h.cursor);
    let state: G['state'] | undefined;
    try {
      state = stateOf(h, actions);
    } catch {
      live = undefined;
    }
    if (port) {
      if (state === undefined) throw new Error('Cannot save an invalid game.');
      return {
        version: format.version,
        appCommit: format.appCommit ?? UNKNOWN_COMMIT,
        contentHash: portHash(cfg.content, cfg.contentHash),
        options: structuredClone(h.options),
        rules: structuredClone(h.rules),
        actions: structuredClone(actions),
        finalHash: sealOf(state, h.undoUsed),
        undoUsed: h.undoUsed,
        savedAt,
      };
    }
    return createSave(
      rules!,
      { options: h.options, rules: h.rules, actions, undoUsed: h.undoUsed, savedAt, ...(state === undefined ? {} : { state }) },
      cfg.content,
      format,
    );
  };
  const saveOf = (h: History<G>): SaveFile<G> => fileOf(h, now().toISOString());

  // The time an autosave is stamped with: now, but never at or before the last autosave's, in this page, another tab or
  // an earlier visit (the stored clock, read at every autosave; with none stored, the latest autosave's savedAt).
  // Continue resumes the latest savedAt and a wall clock can step back. The calls chain, so concurrent autosaves keep
  // their order.
  let last = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const stampAutosave = (): Promise<number> => {
    const n = now().getTime();
    const at = isTime(n) ? n : Date.now();
    const ok = (v: unknown): number => (isTime(v) && v <= at + SAVE_CLOCK_MAX_AHEAD_MS ? v : 0);
    const p = chain.then(async () => {
      let stored = ok(await kv.get(SAVE_CLOCK));
      if (stored === 0) stored = Math.max(0, ...(await list(AUTO)).map(([, s]) => ok(Date.parse(s.save.savedAt))));
      const t = Math.max(at, last + 1, stored + 1);
      return (last = isTime(t) ? t : at);
    });
    chain = p;
    return p;
  };

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
    /** Write a new autosave slot named `name`, stamped later than every earlier autosave, then delete the slots past the
     *  newest `autosaves`. Returns its key. The clock and the slot go in one transaction (IndexedDB, or a backend with
     *  `setMany`); a backend without it writes the clock first, so a failed slot write leaves the clock ahead, never behind. */
    async writeAutosave(h: History<G>, name: string): Promise<string> {
      const t = await stampAutosave();
      const key = AUTO + stamp(t);
      await kv.putMany([
        [SAVE_CLOCK, t as never],
        [key, { name, save: fileOf(h, new Date(t).toISOString()) }],
      ]);
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
      let r: RestoreResult<G>;
      if (!port) r = importSave(rules!, text, cfg.content, format);
      else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return { ok: false, error: 'This is not a save file.' };
        }
        r = portRestore(port, parsed, portHash(cfg.content, cfg.contentHash), format);
      }
      if (!r.ok) return { ok: false, error: r.error };
      const key = NAMED + stamp();
      await kv.put(key, { name, save: r.save });
      return { ok: true, key };
    },
    /** Every named save, newest first. */
    listNamed: (): Promise<[string, StoredSave<G>][]> => list(NAMED),
    get: (key: string): Promise<StoredSave<G> | undefined> => kv.get(key),
    remove: (key: string): Promise<void> => kv.remove(key),
    /** Rename a named save (the name trimmed). False for an empty name or a key that is not a stored named save. */
    async rename(key: string, name: string): Promise<boolean> {
      const clean = name.trim();
      const stored = key.startsWith(NAMED) ? await kv.get(key) : undefined;
      if (clean === '' || stored === undefined) return false;
      await kv.put(key, { ...stored, name: clean });
      return true;
    },
    /** Everything this table holds, for data.ts (`stores`): `read` for the export, `clear` for the reset. */
    data: {
      read: async (): Promise<unknown> => Object.fromEntries(await kv.all()),
      async clear(): Promise<void> {
        for (const [k] of await kv.all()) await kv.remove(k);
        last = 0;
      },
    },
    exportText: (s: StoredSave<G>): string => exportSave(s.save),
    exportName: (s: StoredSave<G>): string =>
      `${cfg.filePrefix}-${s.save.savedAt.slice(0, 16).replace(/[:T]/g, '-')}.json`,
    /** Replay a stored save: its state, or why it cannot load (never throws). */
    restore: (s: StoredSave<G>): RestoreResult<G> =>
      port ? portRestore(port, s.save, portHash(cfg.content, cfg.contentHash), format) : restoreSave(rules!, s.save, cfg.content, format),
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
