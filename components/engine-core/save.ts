// A save is `(version, appCommit, contentHash, options, rules, actions, finalHash, undoUsed, savedAt)`; loading migrates
// it to the current version, replays it and checks the hash. A version without a migration step or a content mismatch
// is reported as "from an older build". The engine reads no clock: the caller passes `savedAt`.
// Migration (ported from EBR's save.ts): `migrateSave` brings an older save to the format's version through a chain of
// pure steps, one per version; a save without `version` is version 1. Old files are never rewritten: the migrated copy
// is what loads.
import { hashValue } from './hash.ts';
import { hashState, replay } from './replay.ts';
import type { GameRules, GameTypes } from './types.ts';

export const OLDER_BUILD = 'This save is from an older build.';
export const DAMAGED = 'This save file is damaged.';

/** The commit recorded for a save by a build that does not know its commit. */
export const UNKNOWN_COMMIT = 'unknown';

export interface SaveFile<G extends GameTypes> {
  readonly version: number;
  readonly appCommit: string;
  readonly contentHash: string;
  readonly options: G['options'];
  readonly rules: G['rules'];
  readonly actions: readonly G['action'][];
  readonly finalHash: string;
  readonly undoUsed: boolean;
  readonly savedAt: string;
}

/** A save as read from a file, before migration. */
export type RawSave = Readonly<Record<string, unknown>>;

export interface SaveFormat {
  /** The save version this build writes and reads. Bump when the state, the actions or the rules change shape. */
  readonly version: number;
  /** Step `n` turns a version-`n` save into a version-`n + 1` save. Pure; never touches the input. */
  readonly steps?: Readonly<Record<number, (save: RawSave) => RawSave>>;
  /** The build that writes the save. */
  readonly appCommit?: string;
}

export const DEFAULT_SAVE_FORMAT: SaveFormat = { version: 1 };

/** `finalHash` binds the state and the undo flag, so editing `undoUsed` in an exported save is caught. */
export const sealOf = (state: unknown, undoUsed: boolean): string => hashValue([hashState(state), undoUsed]);

export interface CreateSaveInput<G extends GameTypes> {
  readonly options: G['options'];
  readonly rules: G['rules'];
  readonly actions: readonly G['action'][];
  readonly undoUsed: boolean;
  /** ISO time stamp from the caller. */
  readonly savedAt: string;
}

/** Replay the actions to get the final hash; throws when they do not replay (never save a broken game). */
export function createSave<G extends GameTypes>(
  game: GameRules<G>,
  input: CreateSaveInput<G>,
  content: G['content'],
  format: SaveFormat = DEFAULT_SAVE_FORMAT,
): SaveFile<G> {
  const r = replay(game, input.options, input.rules, input.actions, content);
  if (!r.ok) throw new Error(r.error ?? 'Cannot save an invalid game.');
  return {
    version: format.version,
    appCommit: format.appCommit ?? UNKNOWN_COMMIT,
    contentHash: game.contentHash(content),
    options: structuredClone(input.options),
    rules: structuredClone(input.rules),
    actions: structuredClone(input.actions),
    finalHash: sealOf(r.state, input.undoUsed),
    undoUsed: input.undoUsed,
    savedAt: input.savedAt,
  };
}

export type MigrateResult = { ok: true; save: RawSave; from: number } | { ok: false; message: string };

/** The save at the format's version, or why it cannot be read (a version newer than this build, or a missing step). */
export function migrateSave(save: RawSave, format: SaveFormat = DEFAULT_SAVE_FORMAT): MigrateResult {
  const from = (save['version'] ?? 1) as number;
  if (!Number.isInteger(from) || from < 1)
    return { ok: false, message: `E_SAVE_VERSION: unknown save version ${String(from)}.` };
  if (from > format.version)
    return {
      ok: false,
      message: `E_SAVE_VERSION: the save is version ${String(from)}, written by a newer build (${typeof save['appCommit'] === 'string' ? save['appCommit'] : UNKNOWN_COMMIT}); this build reads up to version ${String(format.version)}.`,
    };
  let s = save;
  for (let v = from; v < format.version; v++) {
    const step = format.steps?.[v];
    if (!step) return { ok: false, message: `E_SAVE_VERSION: no migration from save version ${String(v)}.` };
    s = step(s);
  }
  return { ok: true, save: s['version'] === format.version ? s : { ...s, version: format.version }, from };
}

export type RestoreResult<G extends GameTypes> =
  | { readonly ok: true; readonly save: SaveFile<G>; readonly state: G['state'] }
  | { readonly ok: false; readonly error: string };

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Migrate, check the shape and the pack, replay, and compare the final hash. Never throws. */
export function restoreSave<G extends GameTypes>(
  game: GameRules<G>,
  raw: unknown,
  content: G['content'],
  format: SaveFormat = DEFAULT_SAVE_FORMAT,
): RestoreResult<G> {
  try {
    if (!isObj(raw)) return { ok: false, error: 'This is not a save file.' };
    const m = migrateSave(raw, format);
    if (!m.ok) return { ok: false, error: (raw['version'] as number) > format.version ? m.message : OLDER_BUILD };
    const input = m.save;
    if (
      typeof input['contentHash'] !== 'string' ||
      !isObj(input['options']) ||
      typeof input['options']['seed'] !== 'string' ||
      !isObj(input['rules']) ||
      !Array.isArray(input['actions']) ||
      typeof input['finalHash'] !== 'string' ||
      typeof input['undoUsed'] !== 'boolean' ||
      typeof input['savedAt'] !== 'string'
    ) {
      return { ok: false, error: DAMAGED };
    }
    const save = structuredClone({ appCommit: UNKNOWN_COMMIT, ...input }) as unknown as SaveFile<G>;
    if (save.contentHash !== game.contentHash(content)) return { ok: false, error: OLDER_BUILD };
    const r = replay(game, save.options, save.rules, save.actions, content, { contentHash: save.contentHash });
    // an action the engine refuses: the file was edited (or is broken); a different final hash: the engine changed
    // A9: a different build wrote it, so a refused action means the engine changed, not that the file was edited
    const otherBuild = save.appCommit !== (format.appCommit ?? UNKNOWN_COMMIT) && save.appCommit !== UNKNOWN_COMMIT && format.appCommit !== undefined;
    if (!r.ok || r.state === null) return { ok: false, error: r.reason === 'pack' || otherBuild ? OLDER_BUILD : DAMAGED };
    if (sealOf(r.state, save.undoUsed) !== save.finalHash) return { ok: false, error: OLDER_BUILD };
    return { ok: true, save, state: r.state };
  } catch (e) {
    return { ok: false, error: `This save cannot be loaded: ${String(e)}` };
  }
}

/** Export as JSON text. */
export const exportSave = <G extends GameTypes>(save: SaveFile<G>): string => JSON.stringify(save);

/** Import JSON text; the result is `restoreSave`'s. */
export function importSave<G extends GameTypes>(
  game: GameRules<G>,
  text: string,
  content: G['content'],
  format: SaveFormat = DEFAULT_SAVE_FORMAT,
): RestoreResult<G> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not a save file.' };
  }
  return restoreSave(game, parsed, content, format);
}
