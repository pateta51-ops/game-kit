// Headless replays (ported from Imperium's scripts/replay.ts; per-action hashes from EBR's, injected input and output
// from STCC's).
//
//   node replay.ts <log.json> --engine <module>            replay a game and check its hashes
//   node replay.ts <log.json> --config <replay.json>       the same, the engine module named in a config file
//   node replay.ts <log.json> --engine <module> --record <out.json>   write the log with its hashes (one action per line)
//
// The engine module exports `engine`: `{ game, content(), format?, describe? }` (a ReplayEngine). A log is a sealed save
// of engine-core (migrated first) or a record `{ options, rules, actions, contentHash?, finalHash?, hashes?, events? }`:
// `hashes[0]` is the state hash after createGame, then one per action, and `events` the hashes of each step's events.
//   node replay.ts <log.json> --engine <module> --checkpoints <golden.json> [--update-golden]
//     compare the hash at every checkpoint the engine names (`checkpoint`, e.g. one per round) with the golden file;
//     `--update-golden` writes the file instead (one checkpoint per line)
//
// A replay rebuilds the game and applies every action; it reports where it failed, the first step whose hash differs,
// whether the final hash matches, and the game's own lines (`describe`). Exit codes: 0 the replay applied every action
// and every hash matches, 1 otherwise, 2 bad usage, an unreadable file or an engine module that does not load.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applyAction,
  createGame,
  hashState,
  hashValue,
  migrateSave,
  sealOf,
  type GameRules,
  type GameTypes,
  type RawSave,
  type SaveFormat,
} from '../engine-core/index.ts';

const USAGE = 'usage: node replay.ts <log.json> (--engine <module> | --config <replay.json>) [--record <out.json>] [--checkpoints <golden.json> [--update-golden]]';

export interface ReplayEngine<G extends GameTypes = GameTypes> {
  readonly game: GameRules<G>;
  content(): G['content'] | Promise<G['content']>;
  readonly format?: SaveFormat;
  /** Lines about the final state (result, scores). */
  describe?(state: G['state'], content: G['content']): string[];
  /** The name of the checkpoint this state is (after createGame: `action` null; then after each action), or null. */
  checkpoint?(state: G['state'], content: G['content'], action: G['action'] | null): string | null;
  /** What a checkpoint hashes instead of the whole state (the rule-visible part). */
  project?(state: G['state'], content: G['content']): unknown;
}

export interface Checkpoint {
  readonly name: string;
  /** Actions applied when it was taken. */
  readonly at: number;
  readonly hash: string;
}

/** A checkpoint golden as text, one checkpoint per line. */
export function checkpointText(points: readonly Checkpoint[]): string {
  return `{"checkpoints":[${points.map((p) => `\n ${JSON.stringify(p)}`).join(',')}\n]}\n`;
}

/** The first checkpoint that differs between a golden and a replay, or null. */
export function checkpointDiff(want: readonly Checkpoint[], got: readonly Checkpoint[]): string | null {
  for (let i = 0; i < Math.max(want.length, got.length); i += 1) {
    const w = want[i];
    const g = got[i];
    if (w === undefined) return `checkpoint ${String(i)}: the golden ends, the replay has "${g?.name ?? ''}"`;
    if (g === undefined) return `checkpoint ${String(i)} "${w.name}": the replay ends before it`;
    if (w.name !== g.name || w.at !== g.at) return `checkpoint ${String(i)}: golden "${w.name}" after ${String(w.at)} actions, replay "${g.name}" after ${String(g.at)}`;
    if (w.hash !== g.hash) return `checkpoint ${String(i)} "${w.name}" (after ${String(w.at)} actions): hash ${w.hash} in the golden, ${g.hash} now`;
  }
  return null;
}

const show = (v: unknown): string => JSON.stringify(v) ?? 'undefined';

/** The leaves that differ between two plain values, by path (`- a.b[2] = 4`, `+ a.b[2] = 5`), at most `max` lines. */
export function pathDiff(a: unknown, b: unknown, max = 20): string[] {
  const out: string[] = [];
  const isObj = (v: unknown): v is object => v !== null && typeof v === 'object';
  const walk = (x: unknown, y: unknown, path: string): void => {
    if (isObj(x) && isObj(y) && Array.isArray(x) === Array.isArray(y)) {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const k of keys) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], Array.isArray(x) ? `${path}[${k}]` : `${path}${path === '' ? '' : '.'}${k}`);
    } else if (show(x) !== show(y)) {
      if (x !== undefined) out.push(`- ${path || '.'} = ${show(x)}`);
      if (y !== undefined) out.push(`+ ${path || '.'} = ${show(y)}`);
    }
  };
  walk(a, b, '');
  return out.length > max ? [...out.slice(0, max), `... ${String(out.length - max)} more`] : out;
}

/** A 32-bit digest (8 hex digits) of a curated view of the table. */
export const viewDigest = (view: unknown): string => hashValue(view).slice(0, 8);

export interface Io {
  out(line: string): void;
  err(line: string): void;
  read(path: string): string;
  write(path: string, text: string): void;
  exists(path: string): boolean;
  /** The file names in a folder (none when it is missing). */
  list?(dir: string): string[];
  /** Import an engine module. */
  load(path: string): Promise<unknown>;
}

export const nodeIo: Io = {
  out: (line) => {
    console.log(line);
  },
  err: (line) => {
    console.error(line);
  },
  read: (path) => readFileSync(path, 'utf8'),
  write: (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  },
  exists: (path) => existsSync(path),
  list: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
  load: (path) => import(pathToFileURL(resolve(path)).href),
};

export interface ReplayLog {
  readonly options: unknown;
  readonly rules: unknown;
  readonly actions: readonly unknown[];
  readonly contentHash?: string;
  readonly finalHash?: string;
  /** A sealed save: `finalHash` binds the state hash and this flag. */
  readonly undoUsed?: boolean;
  readonly hashes?: readonly string[];
  readonly events?: readonly string[];
}

/** A parsed log (a save is migrated to the engine's format first), or why it is not one. */
export function parseLog(text: string, format?: SaveFormat): { ok: true; log: ReplayLog } | { ok: false; message: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: 'not a replay log' };
  let file = value as RawSave;
  if (typeof file['undoUsed'] === 'boolean') {
    const m = migrateSave(file, format);
    if (!m.ok) return { ok: false, message: m.message };
    file = m.save;
  }
  if (!Array.isArray(file['actions']) || typeof file['options'] !== 'object' || file['options'] === null) {
    return { ok: false, message: 'the log lacks its options or actions' };
  }
  return { ok: true, log: file as unknown as ReplayLog };
}

/** The log as JSON text, one action per line (a golden file diffs action by action). */
export function logText(log: ReplayLog): string {
  const { actions, ...rest } = log;
  const head = JSON.stringify(rest, null, 2).replace(/\n}$/, '');
  const body = actions.length === 0 ? '[]' : `[\n${actions.map((a) => `    ${JSON.stringify(a)}`).join(',\n')}\n  ]`;
  return `${head}${Object.keys(rest).length > 0 ? ',' : ''}\n  "actions": ${body}\n}\n`;
}

/** The engine a module path or a config file names, or why it does not load. */
export async function loadEngine(io: Io, module: string | null, config: string | null): Promise<ReplayEngine | string> {
  let path = module;
  if (config !== null) {
    if (!io.exists(config)) return `no config at ${config}`;
    try {
      const c = JSON.parse(io.read(config)) as { engine?: unknown };
      if (typeof c.engine !== 'string') return `${config}: no "engine" module path`;
      path = resolve(dirname(config), c.engine);
    } catch (e) {
      return `${config}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  if (path === null) return USAGE;
  try {
    const m = (await io.load(path)) as { engine?: ReplayEngine; default?: ReplayEngine };
    const engine = m.engine ?? m.default;
    if (engine === undefined || typeof engine.game?.blank !== 'function' || typeof engine.content !== 'function') {
      return `${path} exports no engine ({ game, content })`;
    }
    return engine;
  } catch (e) {
    return `${path}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Replay one log; returns the exit code. With `record`, writes the log with its hashes there. */
export async function replayFile<G extends GameTypes>(path: string, engine: ReplayEngine<G>, io: Io, record: string | null = null, golden: { path: string; update: boolean } | null = null): Promise<number> {
  if (golden !== null && engine.checkpoint === undefined) {
    io.err('--checkpoints needs an engine with `checkpoint`');
    return 2;
  }
  if (!io.exists(path)) {
    io.err(`no file at ${path}`);
    return 2;
  }
  if (record !== null && resolve(record) === resolve(path)) {
    io.err(`--record ${record} would overwrite the log it replays`);
    return 2;
  }
  const parsed = parseLog(io.read(path), engine.format);
  if (!parsed.ok) {
    io.err(`${path}: ${parsed.message}`);
    return 2;
  }
  const log = parsed.log;
  const game = engine.game;
  let content: G['content'];
  try {
    content = await engine.content();
  } catch (e) {
    io.err(e instanceof Error ? e.message : String(e));
    return 2;
  }
  const contentHash = game.contentHash(content);
  if (log.contentHash !== undefined && log.contentHash !== contentHash) {
    io.out(`warning: the log was made with content ${log.contentHash}, the content is ${contentHash}`);
  }
  const hashes: string[] = [];
  const events: string[] = [];
  const points: Checkpoint[] = [];
  const mark = (s: G['state'], at: number, action: G['action'] | null): void => {
    if (golden === null) return;
    const name = engine.checkpoint?.(s, content, action) ?? null;
    if (name !== null) points.push({ name, at, hash: engine.project === undefined ? hashState(s) : hashValue(engine.project(s, content)) });
  };
  let failed: string | null = null;
  let state: G['state'] | null = null;
  try {
    const created = createGame(game, log.options as G['options'], log.rules, content);
    let cur: G['state'] = created.state;
    state = cur;
    hashes.push(hashState(cur));
    events.push(hashValue(created.events));
    mark(cur, 0, null);
    for (const [at, action] of log.actions.entries()) {
      try {
        const r = applyAction(game, cur, action as G['action'], content);
        cur = r.state;
        state = cur;
        hashes.push(hashState(cur));
        events.push(hashValue(r.events));
        mark(cur, at + 1, action as G['action']);
      } catch (e) {
        failed = `failed at action ${String(at)}: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }
    }
  } catch (e) {
    failed = `the options cannot start a game: ${e instanceof Error ? e.message : String(e)}`;
  }
  io.out(`${path}: ${String(log.actions.length)} actions, ${failed ?? 'all applied'}`);
  let ok = failed === null;
  // per action: the first step whose state or events hash differs (0 is createGame)
  if (log.hashes !== undefined || log.events !== undefined) {
    const n = Math.max(log.hashes?.length ?? 0, log.events?.length ?? 0, hashes.length);
    for (let i = 0; i < n; i += 1) {
      if ((log.hashes !== undefined && log.hashes[i] !== hashes[i]) || (log.events !== undefined && log.events[i] !== events[i])) {
        io.out(`DIFF first difference after action ${String(i)}`);
        ok = false;
        break;
      }
    }
  }
  if (state !== null) {
    const final = log.undoUsed === undefined ? hashState(state) : sealOf(state, log.undoUsed);
    const matches = log.finalHash === undefined || failed !== null ? null : log.finalHash === final;
    io.out(`result ${JSON.stringify(state.result)}, state hash ${matches === null ? 'not checked' : matches ? 'matches' : 'DIFFERS'}`);
    if (matches === false) ok = false;
    for (const line of engine.describe?.(state, content) ?? []) io.out(line);
  }
  if (golden !== null) {
    if (golden.update) {
      if (failed === null) {
        io.write(golden.path, checkpointText(points));
        io.out(`checkpoints: wrote ${String(points.length)} to ${golden.path}`);
      }
    } else if (!io.exists(golden.path)) {
      io.out(`CHECKPOINTS no golden at ${golden.path} (record it with --update-golden)`);
      ok = false;
    } else {
      let diff: string | null;
      try {
        const want = (JSON.parse(io.read(golden.path)) as { checkpoints?: Checkpoint[] }).checkpoints;
        diff = Array.isArray(want) ? checkpointDiff(want, points) : 'the golden has no checkpoints';
      } catch (e) {
        diff = `the golden is not JSON: ${e instanceof Error ? e.message : String(e)}`;
      }
      io.out(diff === null ? `checkpoints: ${String(points.length)} match` : `CHECKPOINTS ${diff}`);
      if (diff !== null) ok = false;
    }
  }
  if (record !== null && failed === null) {
    io.write(record, logText({ ...log, contentHash, finalHash: hashes[hashes.length - 1] as string, hashes, events, undoUsed: undefined } as unknown as ReplayLog));
    io.out(`recorded ${record}`);
  }
  return ok ? 0 : 1;
}

export async function run(args: readonly string[], io: Io = nodeIo): Promise<number> {
  const flags: Record<string, string | null> = { '--engine': null, '--config': null, '--record': null, '--checkpoints': null };
  const update = args.includes('--update-golden');
  const files: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg in flags) {
      const value = args[i + 1];
      if (value === undefined) {
        io.err(USAGE);
        return 2;
      }
      flags[arg] = value;
      i += 1;
    } else if (arg.startsWith('--') && arg !== '--update-golden') {
      io.err(`unknown option: ${arg}`);
      io.err(USAGE);
      return 2;
    } else if (arg !== '--update-golden') files.push(arg);
  }
  if (files.length !== 1 || (flags['--engine'] === null) === (flags['--config'] === null) || (update && flags['--checkpoints'] === null)) {
    io.err(USAGE);
    return 2;
  }
  const engine = await loadEngine(io, flags['--engine'] ?? null, flags['--config'] === null ? null : resolve(flags['--config'] as string));
  if (typeof engine === 'string') {
    io.err(engine);
    return 2;
  }
  return replayFile(resolve(files[0] as string), engine, io, flags['--record'] === null ? null : resolve(flags['--record'] as string), flags['--checkpoints'] === null ? null : { path: resolve(flags['--checkpoints'] as string), update });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await run(process.argv.slice(2));
}
