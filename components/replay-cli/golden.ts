// Golden games (from Imperium's scripts/sim/golden.ts) and record on one checkout, replay on another (from EBR's
// scripts/replay.ts). The game module exports `simGame` (the sim-pool contract), a spec list (`goldens`, or the export
// `--games` names) and optionally `format` (its SaveFormat).
//
//   node golden.ts check <dir> --game <module> [--only <prefix>] [--update-golden]
//   node golden.ts record <out.json> --game <module> [--only <prefix>] [--games <export>] [--seedx <text>] [--cap <n>]
//   node golden.ts replay <in.json> --game <module> [--only <prefix>]
//
// Exit codes: 0 all the same, 1 a golden or a game differs, 2 bad usage, an unreadable file or a module that does not load.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyAction, causeProblems, createGame, type CauseCheck, createSave, formatTriggerCap, hashValue, restoreSave, type GameRules, type GameTypes, type SaveFile, type SaveFormat } from '../engine-core/index.ts';
import { DriverRng, legalAnswers, type GameSpec, type SimGame } from '../sim-pool/index.ts';
import { logText, nodeIo, pathDiff, viewDigest, type Io } from './replay.ts';

const USAGE = 'usage: node golden.ts (check <dir> | record <out.json> | replay <in.json>) --game <module> [--only <prefix>] [--update-golden] [--games <export>] [--seedx <text>] [--cap <n>]';

/** The `savedAt` of every golden save: fixed, so the same engine writes the same bytes. */
export const GOLDEN_SAVED_AT = '2026-01-01T00:00:00.000Z';

/** One game of the list: its seed is `golden-<name>` unless given. `settings` are the game's own. */
export interface GoldenSpec {
  readonly name: string;
  readonly driver: string;
  readonly seed?: string;
  readonly settings?: GameSpec['settings'];
}

export const goldenGameSpec = (g: GoldenSpec, index = 0, seedx = ''): GameSpec => ({
  index,
  seed: (g.seed ?? `golden-${g.name}`) + seedx,
  driver: g.driver,
  ...(g.settings ? { settings: g.settings } : {}),
});

/** Every `contentHash` value in `json` emptied, those nested in escaped JSON strings included. */
export function blankContentHashes(json: string): string {
  return json.replace(/(contentHash\\*":\\*")[^"\\]*/g, '$1');
}

const blankHash = (v: unknown): string => hashValue(JSON.parse(blankContentHashes(JSON.stringify(v))) as unknown);
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface Played<G extends GameTypes = GameTypes> {
  /** As the game gave them, before createGame. */
  readonly options: G['options'];
  readonly rules: G['rules'];
  readonly actions: G['action'][];
  /** `[0]` after createGame, then one per action; content hashes blanked. */
  readonly hashes: string[];
  readonly events: string[];
  /** Why the run stopped early (a cap, a refused action, a driver error). */
  stopped?: string;
}

/** Play `spec` with its driver, as sim-pool's `playOne` does (the same driver random numbers), keeping the actions. */
export function playGolden<G extends GameTypes, S>(game: SimGame<G, S>, content: G['content'], spec: GameSpec, cap = game.maxActions ?? 100_000): Played<G> {
  const start = game.start(spec, content);
  const out: Played<G> = { options: structuredClone(start.options), rules: structuredClone(start.rules), actions: [], hashes: [], events: [] };
  const first = createGame(game.rules, start.options, start.rules, content);
  let s: G['state'] = first.state;
  out.hashes.push(blankHash(s));
  out.events.push(blankHash(first.events));
  if (first.triggerCap !== undefined) return { ...out, stopped: formatTriggerCap({ ...first.triggerCap, actionIndex: null }) };
  const driver = game.driver(spec.driver, spec, content);
  while (s.result === null) {
    const p = s.prompt;
    if (p === null) return { ...out, stopped: 'no prompt is open and the game has no result' };
    if (out.actions.length >= cap) return { ...out, stopped: `no result after ${String(cap)} actions` };
    try {
      const rng = new DriverRng(`${spec.seed}|${spec.driver}|${String(p.id)}`);
      const answers = game.answers ? game.answers(s, content, rng) : (legalAnswers(p, rng) as G['action'][]);
      const a = driver.choose(s, answers, rng);
      if (a === undefined) return out;
      const r = applyAction(game.rules, s, a, content);
      s = r.state;
      out.actions.push(a);
      out.hashes.push(blankHash(s));
      out.events.push(blankHash(r.events));
      if (r.triggerCap !== undefined) return { ...out, stopped: formatTriggerCap({ ...r.triggerCap, actionIndex: out.actions.length - 1 }) };
    } catch (e) {
      return { ...out, stopped: `stopped at action ${String(out.actions.length)}: ${msg(e)}` };
    }
  }
  return out;
}

/** Play a golden game to its end and save it. Throws if it does not end. */
export function recordGolden<G extends GameTypes, S>(game: SimGame<G, S>, content: G['content'], g: GoldenSpec, format?: SaveFormat): SaveFile<G> {
  const p = playGolden(game, content, goldenGameSpec(g));
  if (p.stopped !== undefined) throw new Error(p.stopped);
  return createSave(game.rules, { options: p.options, rules: p.rules, actions: p.actions, undoUsed: false, savedAt: GOLDEN_SAVED_AT }, content, format);
}

/** A save as stable text, one action per line. */
export const goldenText = <G extends GameTypes>(save: SaveFile<G>): string => logText(save);

export interface GoldenModule<G extends GameTypes = GameTypes, S = unknown> {
  readonly simGame: SimGame<G, S>;
  readonly specs: readonly GoldenSpec[];
  readonly format?: SaveFormat;
  /** The curated table view: its digest after every action is pinned in `<name>.digests` beside the golden. */
  readonly view?: (state: G['state'], content: G['content']) => unknown;
  /** K79, opt-in: the check refuses every counted event of a golden game (after createGame and each action) with no cause. */
  readonly causes?: CauseCheck<G['event']>;
}

type Replayed<G extends GameTypes> = { state: G['state']; digests: string[]; causes: string[] } | { error: string };

/** Replay a save's options and actions; a refused action is the error. With `view`, a digest after createGame and each action. */
function replayView<G extends GameTypes>(rules: GameRules<G>, save: { options: unknown; rules: unknown; actions: readonly unknown[] }, content: G['content'], view?: GoldenModule<G>['view'], causes?: GoldenModule<G>['causes']): Replayed<G> {
  const digests: string[] = [];
  const bad: string[] = [];
  let at = -1;
  const check = (events: readonly G['event'][]): void => {
    if (causes) bad.push(...causeProblems(events, causes).map((p) => `${at < 0 ? 'setup' : `action ${String(at)}`}, ${p}`));
  };
  try {
    const first = createGame(rules, save.options as G['options'], save.rules as G['rules'], content);
    let s: G['state'] = first.state;
    check(first.events);
    if (view) digests.push(viewDigest(view(s, content)));
    for (const [i, a] of save.actions.entries()) {
      at = i;
      const r = applyAction(rules, s, a as G['action'], content);
      s = r.state;
      check(r.events);
      if (view) digests.push(viewDigest(view(s, content)));
    }
    return { state: s, digests, causes: bad };
  } catch (e) {
    return { error: at < 0 ? `the options cannot start a game: ${msg(e)}` : `action ${String(at)} refused: ${msg(e)}` };
  }
}

function firstDiff(stored: readonly unknown[], now: readonly unknown[]): string {
  const show = (a: readonly unknown[], i: number): string => (i < a.length ? JSON.stringify(a[i]) : 'the game ended');
  for (let i = 0; i < Math.max(stored.length, now.length); i += 1) {
    if (show(stored, i) !== show(now, i)) return `first difference at action ${String(i)}: stored ${show(stored, i)}, now ${show(now, i)}`;
  }
  return 'the actions are the same, the options, the rules, the content or the final hash differ';
}

const picked = (specs: readonly GoldenSpec[], only: string | null): GoldenSpec[] => specs.filter((g) => only === null || g.name.startsWith(only));

/** Record every golden again and compare it with `<dir>/<name>.json`; with `update`, write the ones that changed. */
export async function checkGoldens<G extends GameTypes, S>(mod: GoldenModule<G, S>, dir: string, io: Io, opts: { update?: boolean; only?: string | null } = {}): Promise<number> {
  const content = await mod.simGame.content();
  const specs = picked(mod.specs, opts.only ?? null);
  let bad = 0;
  const moved: string[] = [];
  const kinds: Record<string, number> = {};
  const fail = (line: string): void => {
    io.out(`FAIL ${line}`);
    bad += 1;
  };
  for (const g of specs) {
    const file = join(dir, `${g.name}.json`);
    try {
      const save = recordGolden(mod.simGame, content, g, mod.format);
      const text = goldenText(save);
      const old = io.exists(file) ? io.read(file).replace(/\r\n/g, '\n') : null;
      const now = replayView(mod.simGame.rules, save, content, mod.view, mod.causes);
      if ('error' in now) throw new Error(now.error);
      if (now.causes.length > 0) {
        fail(`${g.name}: ${String(now.causes.length)} number-changing event(s) with no cause`);
        io.out(`  NO CAUSE\n${now.causes.slice(0, 10).map((l) => `  ${l}`).join('\n')}`);
        kinds['no cause'] = (kinds['no cause'] ?? 0) + 1;
      }
      if (mod.view) {
        const dfile = join(dir, `${g.name}.digests`);
        const dtext = `${now.digests.join('\n')}\n`;
        const dold = io.exists(dfile) ? io.read(dfile).replace(/\r\n/g, '\n') : null;
        if (dold !== dtext) {
          if (opts.update === true) {
            io.write(dfile, dtext);
            io.out(`recorded ${dfile}`);
          } else {
            const was = dold === null ? [] : dold.split('\n').slice(0, -1);
            const i = now.digests.findIndex((d, k) => d !== was[k]);
            io.out(`MOVED ${g.name}: ${dold === null ? 'no digest file (record it with --update-golden)' : `the view digest first moves after action ${String(i < 0 ? now.digests.length : i)} (${String(was.length)} stored, ${String(now.digests.length)} now)`}`);
            moved.push(g.name);
            bad += 1;
          }
        }
      }
      const ffile = join(dir, `${g.name}.final`);
      const fnow = JSON.stringify(now.state, null, 1);
      const fold = io.exists(ffile) ? io.read(ffile).replace(/\r\n/g, '\n') : null;
      const fdiff = fold === null || opts.update === true ? [] : pathDiff(JSON.parse(fold), JSON.parse(fnow));
      if (opts.update === true && fold !== fnow) {
        io.write(ffile, fnow);
        io.out(`recorded ${ffile}`);
      }
      if (old === text) {
        if (fdiff.length > 0) {
          fail(`${g.name}: the same actions end in another final state`);
          io.out(`  CHANGED\n${fdiff.map((l) => `  ${l}`).join('\n')}`);
          kinds['changed'] = (kinds['changed'] ?? 0) + 1;
        }
        continue;
      }
      if (opts.update === true) {
        io.write(file, text);
        io.out(`recorded ${file}`);
      } else if (old === null) fail(`${g.name}: no golden file (record it with --update-golden)`);
      else {
        let why: string;
        let verdict = 'crashed';
        let diff: string[] = [];
        try {
          const raw = JSON.parse(old) as { actions?: unknown; options?: unknown; rules?: unknown } | null;
          const r = restoreSave(mod.simGame.rules, raw, content, mod.format);
          const stored = raw !== null && Array.isArray(raw.actions) ? (raw.actions as unknown[]) : [];
          why = `${r.ok ? 'the stored game replays, the driver now plays another' : `the stored game does not replay (${r.error})`}; ${firstDiff(stored, save.actions)}`;
          const was = replayView(mod.simGame.rules, { options: raw?.options, rules: raw?.rules, actions: stored }, content);
          verdict = 'error' in was ? 'diverged' : 'changed';
          if (!('error' in was)) diff = fold === null ? pathDiff(was.state, now.state) : fdiff;
        } catch (e) {
          why = `not JSON: ${msg(e)}`;
        }
        fail(`${g.name}: ${why}`);
        io.out(`  ${verdict.toUpperCase()}${diff.map((l) => `\n  ${l}`).join('')}`);
        kinds[verdict] = (kinds[verdict] ?? 0) + 1;
      }
    } catch (e) {
      fail(`${g.name}: ${msg(e)}`);
      io.out('  CRASHED');
      kinds['crashed'] = (kinds['crashed'] ?? 0) + 1;
    }
  }
  if ((opts.only ?? null) === null && opts.update !== true) {
    const names = new Set(mod.specs.map((g) => `${g.name}.json`));
    for (const f of io.list?.(dir) ?? []) if (f.endsWith('.json') && !names.has(f)) fail(`${f}: no golden game of that name`);
  }
  io.out(`${String(specs.length)} golden games, ${String(bad)} failed${Object.entries(kinds).map(([k, n]) => `, ${String(n)} ${k}`).join('')}`);
  if (moved.length > 0) io.out(`view digests moved: ${moved.join(', ')}`);
  return bad > 0 ? 1 : 0;
}

export interface CrossGame {
  readonly name: string;
  readonly spec: GameSpec;
  readonly options: unknown;
  readonly rules: unknown;
  readonly actions: readonly unknown[];
  readonly hashes: readonly string[];
  readonly events: readonly string[];
  readonly stopped?: string;
  /** The game did not start on the recording checkout. */
  readonly failed?: string;
}

/** Play the games on this checkout and write them with a state hash and an event hash per action. */
export async function recordGames<G extends GameTypes, S>(mod: GoldenModule<G, S>, out: string, io: Io, opts: { only?: string | null; seedx?: string; cap?: number } = {}): Promise<number> {
  const specs = picked(mod.specs, opts.only ?? null);
  if (specs.length === 0) {
    io.err('no games to record');
    return 2;
  }
  const content = await mod.simGame.content();
  const games: CrossGame[] = [];
  let stopped = 0;
  let failed = 0;
  let errors = 0;
  for (const [i, g] of specs.entries()) {
    const spec = goldenGameSpec(g, i, opts.seedx ?? '');
    let p: Played<G>;
    try {
      p = playGolden(mod.simGame, content, spec, opts.cap);
    } catch (e) {
      games.push({ name: g.name, spec, options: null, rules: null, actions: [], hashes: [], events: [], failed: msg(e) });
      io.out(`FAILED ${g.name}: ${msg(e)}`);
      failed += 1;
      continue;
    }
    games.push({ name: g.name, spec, ...p });
    if (p.stopped === undefined) io.out(`${g.name}: ${String(p.actions.length)} actions, ended`);
    else {
      stopped += 1;
      if (opts.cap === undefined || p.stopped !== `no result after ${String(opts.cap)} actions`) errors += 1;
      io.out(`STOPPED ${g.name}: ${String(p.actions.length)} actions, ${p.stopped}`);
    }
  }
  try {
    io.write(out, `{"count":${String(games.length)},"games":[\n${games.map((x) => JSON.stringify(x)).join(',\n')}\n]}\n`);
  } catch (e) {
    io.err(`${out}: ${msg(e)}`);
    return 2;
  }
  io.out(`recorded ${String(games.length)} games in ${out} (${String(stopped)} stopped, ${String(failed)} failed)`);
  return failed + errors > 0 ? 1 : 0;
}

/** Apply the recorded actions on this checkout; the first action after which a state or event hash differs fails the game. */
export async function replayGames<G extends GameTypes, S>(mod: GoldenModule<G, S>, file: string, io: Io, opts: { only?: string | null } = {}): Promise<number> {
  let games: CrossGame[];
  let bad = 0;
  const only = opts.only ?? null;
  try {
    const v = JSON.parse(io.read(file)) as { games?: unknown; count?: unknown } | null;
    if (v === null || !Array.isArray(v.games)) throw new Error('not a record of games');
    games = (v.games as CrossGame[]).filter((x) => only === null || x.name.startsWith(only));
    if (only !== null && games.length === 0) throw new Error(`no game named ${only}...`);
    if (typeof v.count === 'number' && v.count !== v.games.length) {
      io.out(`DIFF the record holds ${String(v.games.length)} of ${String(v.count)} games`);
      bad += 1;
    }
  } catch (e) {
    io.err(`${file}: ${msg(e)}`);
    return 2;
  }
  const sim = mod.simGame;
  const content = await sim.content();
  const len = (x: unknown): number => (Array.isArray(x) ? x.length : -1);
  for (const g of games) {
    let diff: string | null;
    if (g.failed !== undefined) diff = `was not recorded: ${g.failed}`;
    else if (len(g.actions) < 0 || len(g.hashes) !== len(g.actions) + 1 || len(g.events) !== len(g.actions) + 1) {
      diff = `the record is cut short (${String(len(g.actions))} actions, ${String(len(g.hashes))} state hashes, ${String(len(g.events))} event hashes)`;
    } else
    try {
      const first = createGame(mod.simGame.rules, structuredClone(g.options) as G['options'], structuredClone(g.rules) as G['rules'], content);
      let s: G['state'] = first.state;
      const at = (i: number, events: unknown): string | null =>
        blankHash(s) !== g.hashes[i] ? `state after action ${String(i)}` : blankHash(events) !== g.events[i] ? `events of action ${String(i)}` : null;
      diff = at(0, first.events);
      let triggerStop = first.triggerCap === undefined ? undefined : formatTriggerCap({ ...first.triggerCap, actionIndex: null });
      for (let i = 0; diff === null && i < g.actions.length; i += 1) {
        try {
          const r = applyAction(mod.simGame.rules, s, g.actions[i] as G['action'], content);
          s = r.state;
          diff = at(i + 1, r.events);
          if (r.triggerCap !== undefined) triggerStop ??= formatTriggerCap({ ...r.triggerCap, actionIndex: i });
        } catch (e) {
          diff = `action ${String(i + 1)} refused: ${msg(e)}`;
        }
      }
      if (diff === null) {
        const now = triggerStop ?? ((): string | undefined => {
          if (s.result !== null) return undefined;
          const p = s.prompt;
          if (p === null) return 'no prompt is open and the game has no result';
          if (g.stopped === `no result after ${String(g.actions.length)} actions`) return g.stopped;
          try {
            const rng = new DriverRng(`${g.spec.seed}|${g.spec.driver}|${String(p.id)}`);
            const answers = sim.answers ? sim.answers(s, content, rng) : (legalAnswers(p, rng) as G['action'][]);
            const a = sim.driver(g.spec.driver, g.spec, content).choose(s, answers, rng);
            if (a === undefined) return undefined;
            applyAction(sim.rules, s, a, content);
          } catch (e) {
            return `stopped at action ${String(g.actions.length)}: ${msg(e)}`;
          }
          return 'the game goes on';
        })();
        if (now !== g.stopped) diff = `stop: recorded ${g.stopped ?? 'the game ended'}, now ${now ?? 'the game ended'}`;
      }
    } catch (e) {
      diff = `the options cannot start a game: ${msg(e)}`;
    }
    if (diff !== null) {
      io.out(`DIFF ${g.name}: ${diff}`);
      bad += 1;
    }
  }
  io.out(`${String(games.length)} games, ${String(bad)} differ`);
  return bad > 0 ? 1 : 0;
}

export async function run(args: readonly string[], io: Io = nodeIo): Promise<number> {
  const flags: Record<string, string | null> = { '--game': null, '--only': null, '--games': null, '--seedx': null, '--cap': null };
  const rest: string[] = [];
  let update = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === '--update-golden') update = true;
    else if (arg in flags) {
      const value = args[i + 1];
      if (value === undefined) {
        io.err(USAGE);
        return 2;
      }
      flags[arg] = value;
      i += 1;
    } else if (arg.startsWith('--')) {
      io.err(`unknown option: ${arg}`);
      io.err(USAGE);
      return 2;
    } else rest.push(arg);
  }
  const [mode, path] = rest;
  const game = flags['--game'] ?? null;
  const cap = (flags['--cap'] ?? null) === null ? undefined : Number(flags['--cap']);
  if (rest.length !== 2 || path === undefined || game === null || (mode !== 'check' && mode !== 'record' && mode !== 'replay') || (cap !== undefined && !(Number.isInteger(cap) && cap > 0)) || (update && mode !== 'check') || (cap !== undefined && mode !== 'record')) {
    io.err(USAGE);
    return 2;
  }
  const list = flags['--games'] ?? 'goldens';
  let mod: GoldenModule;
  try {
    const m = (await io.load(resolve(game))) as Record<string, unknown>;
    const simGame = m['simGame'] as { start?: unknown; content?: unknown } | undefined;
    const specs = m[list] ?? (mode === 'replay' ? [] : undefined);
    if (typeof simGame?.start !== 'function' || typeof simGame.content !== 'function' || !Array.isArray(specs)) {
      io.err(`${game} exports no simGame or no ${list} list`);
      return 2;
    }
    mod = { simGame: simGame as unknown as SimGame<GameTypes>, specs: specs as GoldenSpec[], ...(m['format'] !== undefined ? { format: m['format'] as SaveFormat } : {}), ...(typeof m['view'] === 'function' ? { view: m['view'] as NonNullable<GoldenModule['view']> } : {}), ...(typeof (m['causes'] as { counts?: unknown } | undefined)?.counts === 'function' ? { causes: m['causes'] as CauseCheck } : {}) };
  } catch (e) {
    io.err(`${game}: ${msg(e)}`);
    return 2;
  }
  const only = flags['--only'] ?? null;
  try {
    if (mode === 'check') return await checkGoldens(mod, resolve(path), io, { update, only });
    if (mode === 'record') return await recordGames(mod, resolve(path), io, { only, seedx: flags['--seedx'] ?? '', ...(cap !== undefined ? { cap } : {}) });
    return await replayGames(mod, resolve(path), io, { only });
  } catch (e) {
    io.err(msg(e));
    return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await run(process.argv.slice(2));
}
