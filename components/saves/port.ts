// K403: saves over an engine-core `EnginePort` (a game with its own engine): the save holds the seed, the content hash and
// the answers in order; restore is start, settle, then portAnswer for each. Same errors as engine-core's restoreSave.
import {
  DAMAGED,
  hashValue,
  migrateSave,
  OLDER_BUILD,
  portAnswer,
  portSettle,
  sealOf,
  UNKNOWN_COMMIT,
  DEFAULT_SAVE_FORMAT,
  type EnginePort,
  type GameRules,
  type GameTypes,
  type PortAnswer,
  type RestoreResult,
  type SaveFile,
  type SaveFormat,
} from '../engine-core/index.ts';

export const isPort = <G extends GameTypes>(g: GameRules<G> | EnginePort<G>): g is EnginePort<G> => 'settle' in g && 'start' in g;

export const portStart = <G extends GameTypes>(port: EnginePort<G>, seed: string): G['state'] => portSettle(port, port.start(seed)).state;
export const portStep = <G extends GameTypes>(port: EnginePort<G>, state: G['state'], action: G['action']): G['state'] =>
  portAnswer(port, state, action as PortAnswer).state;

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

export function portRestore<G extends GameTypes>(
  port: EnginePort<G>,
  raw: unknown,
  hash: string,
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
    if (save.contentHash !== hash) return { ok: false, error: OLDER_BUILD };
    const otherBuild = save.appCommit !== (format.appCommit ?? UNKNOWN_COMMIT) && save.appCommit !== UNKNOWN_COMMIT && format.appCommit !== undefined;
    let state: G['state'];
    try {
      state = portStart(port, (save.options as { seed: string }).seed);
      for (const a of save.actions) state = portStep(port, state, a);
    } catch {
      return { ok: false, error: otherBuild ? OLDER_BUILD : DAMAGED };
    }
    if (sealOf(state, save.undoUsed) !== save.finalHash) return { ok: false, error: OLDER_BUILD };
    return { ok: true, save, state };
  } catch (e) {
    return { ok: false, error: `This save cannot be loaded: ${String(e)}` };
  }
}

export const portHash = (content: unknown, contentHash?: (c: never) => string): string => (contentHash ? contentHash(content as never) : hashValue(content));
