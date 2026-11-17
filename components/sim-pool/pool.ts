// Runs the games of a simulation in this thread or on worker threads (warps scripts/sim/pool.ts): each worker asks for
// its next game when it finishes one, and records come back in index order, so results never depend on the number of
// workers. A worker that dies (ebr scripts/sim/pool.ts) turns the game it held into a crash record and a new worker
// takes the next games. A worker loads the game's module (`simGame` export).
import { Worker } from 'node:worker_threads';
import { isChecking, isFreezing, setInvariantChecking, setStateFreezing, type GameTypes } from '../engine-core/index.ts';
import { CRASH_HASH, crashRecord, playOne, type GameSpec, type SimGame, type SimRecord } from './play.ts';

export interface RunRequest {
  /** The URL of the module that exports `simGame`. */
  readonly module: string;
  readonly specs: readonly GameSpec[];
  /** Invariant checks on (default true). */
  readonly invariants?: boolean;
  /** A bundled worker (the bundle of worker.ts); default worker.ts. */
  readonly worker?: string;
  /** Stop each game after this many applied actions (a replay to a step). */
  readonly until?: number | undefined;
  /** Every game on a worker thread of its own (slow): what the game's module keeps between games cannot reach the next one. */
  readonly fresh?: boolean | undefined;
  /** K101: render the game's `view` after setup and every action. */
  readonly view?: boolean | undefined;
  /** K101: apply the game's `hasten` action after every N actions. */
  readonly hasten?: number | undefined;
  /** K274: the hidden-shuffle check (see `PlayOptions.hidden`). */
  readonly hidden?: boolean | number | undefined;
  /** K273: a game that runs longer than this many ms (wall clock) is stopped and recorded as `timeout`; its worker is terminated. Default off. Games then run on worker threads, never in this one (a loop cannot be interrupted there). */
  readonly gameTimeoutMs?: number | undefined;
}

export interface WorkerInput {
  readonly module: string;
  readonly invariants: boolean;
  readonly until?: number | undefined;
  readonly view?: boolean | undefined;
  readonly hasten?: number | undefined;
  readonly hidden?: boolean | number | undefined;
}
export type WorkerCommand = { type: 'play'; spec: GameSpec } | { type: 'stop' };
export type WorkerMessage = { type: 'record'; record: SimRecord } | { type: 'ready' };

const load = async (module: string): Promise<SimGame<GameTypes>> =>
  ((await import(module)) as { simGame: SimGame<GameTypes> }).simGame;

/** Play every game in this thread. */
export async function runInThread(request: RunRequest, onRecord?: (r: SimRecord) => void): Promise<SimRecord[]> {
  const game = await load(request.module);
  const content = await game.content();
  const was = isChecking();
  const froze = isFreezing();
  setInvariantChecking(request.invariants ?? true);
  setStateFreezing(false);
  try {
    return request.specs.map((spec) => {
      const r = playOne(game, content, spec, request.until, { view: request.view, hasten: request.hasten, hidden: request.hidden });
      onRecord?.(r);
      return r;
    });
  } finally {
    setInvariantChecking(was);
    setStateFreezing(froze);
  }
}

function boot(request: RunRequest, input: WorkerInput): Worker {
  if (request.worker !== undefined) return new Worker(new URL(request.worker), { workerData: input });
  return new Worker(new URL('./worker.ts', import.meta.url), { workerData: input });
}

export const TIMEOUT = 'timeout';

/** K273: a game stopped by the wall-clock guard: a failed record (errorName `timeout`, never checkpointed). */
export const timeoutRecord = (spec: GameSpec, ms: number): SimRecord<never> => ({
  ...crashRecord(spec, ''),
  hash: CRASH_HASH,
  errorName: TIMEOUT,
  error: `timeout in game ${String(spec.index)} (seed ${spec.seed}): over ${String(ms)} ms`,
});

async function lane(request: RunRequest, next: () => GameSpec | undefined, collect: (r: SimRecord) => void): Promise<void> {
  const input: WorkerInput = { module: request.module, invariants: request.invariants ?? true, until: request.until, view: request.view, hasten: request.hasten, hidden: request.hidden };
  for (;;) {
    let held: GameSpec | undefined;
    let stopped = false;
    let again = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const w = boot(request, input);
        w.on('message', (m: WorkerMessage) => {
          if (timedOut) return;
          clearTimeout(timer);
          if (m.type === 'record') collect(m.record);
          if (m.type === 'record' && request.fresh === true) {
            held = undefined;
            again = true;
            stopped = true;
            w.postMessage({ type: 'stop' } satisfies WorkerCommand);
            return;
          }
          held = next();
          if (held === undefined) {
            stopped = true;
            w.postMessage({ type: 'stop' } satisfies WorkerCommand);
          } else {
            w.postMessage({ type: 'play', spec: held } satisfies WorkerCommand);
            const ms = request.gameTimeoutMs;
            const spec = held;
            if (ms !== undefined)
              timer = setTimeout(() => {
                timedOut = true;
                held = undefined;
                again = true;
                collect(timeoutRecord(spec, ms));
                void w.terminate();
              }, ms);
          }
        });
        w.on('error', reject);
        w.on('exit', (code) => {
          clearTimeout(timer);
          if (timedOut) resolve();
          else if (stopped && code === 0) resolve();
          else reject(new Error(`a simulation worker stopped with exit code ${String(code)}`));
        });
      });
      if (!again) return;
    } catch (e) {
      if (again) continue;
      if (stopped) return; // died after its last game: nothing lost
      held ??= next(); // died before its first game (the module failed to load): the next game takes the crash
      if (held === undefined) return;
      collect(crashRecord(held, e));
    }
  }
}

/** Play every game on `workers` threads (this thread when 1). Records in index order; `onRecord` as each one ends. */
export async function runGames(request: RunRequest, workers: number, onRecord?: (r: SimRecord) => void): Promise<SimRecord[]> {
  const records: SimRecord[] = [];
  const collect = (r: SimRecord): void => {
    records.push(r);
    onRecord?.(r);
  };
  const count = Math.max(1, Math.min(workers, request.specs.length));
  if (count === 1 && request.fresh !== true && request.gameTimeoutMs === undefined) await runInThread(request, collect);
  else {
    let at = 0;
    const next = (): GameSpec | undefined => request.specs[at++];
    await Promise.all(Array.from({ length: count }, () => lane(request, next, collect)));
  }
  return records.sort((a, b) => a.index - b.index);
}
