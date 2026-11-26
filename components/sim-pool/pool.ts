// Runs the games of a simulation in this thread or on worker threads (warps scripts/sim/pool.ts): each worker asks for
// its next game when it finishes one, and records come back in index order, so results never depend on the number of
// workers. A worker that dies (ebr scripts/sim/pool.ts) turns the game it held into a crash record and a new worker
// takes the next games. A worker loads the game's module (`simGame` export).
import { Worker } from 'node:worker_threads';
import { isChecking, isFreezing, setInvariantChecking, setStateFreezing, type GameTypes, type PortTypes } from '../engine-core/index.ts';
import { CRASH_HASH, crashRecord, DriverRegistrationError, isDriverRegistrationError, playOne, type GameSpec, type SimGame, type SimRecord } from './play.ts';
import type { PortSimGame } from './port.ts';

export interface RunRequest {
  /** The URL of the module that exports `simGame`. */
  readonly module: string;
  readonly specs: readonly GameSpec[];
  /** Also validate these registrations. Resumed runs include the names of checkpointed specs. */
  readonly preflightDriverNames?: readonly string[];
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
  readonly debug?: number | undefined;
  /** K274: the hidden-shuffle check (see `PlayOptions.hidden`). */
  readonly hidden?: boolean | number | undefined;
  /** K273: a game that runs longer than this many ms (wall clock) is stopped and recorded as `timeout`; its worker is terminated. Default off. Games then run on worker threads, never in this one (a loop cannot be interrupted there). */
  readonly gameTimeoutMs?: number | undefined;
}

export interface WorkerInput {
  readonly module: string;
  readonly driverNames?: readonly string[];
  readonly invariants: boolean;
  readonly until?: number | undefined;
  readonly view?: boolean | undefined;
  readonly hasten?: number | undefined;
  readonly debug?: number | undefined;
  readonly hidden?: boolean | number | undefined;
  readonly inspectOnly?: boolean;
}
export type WorkerCommand = { type: 'play'; spec: GameSpec } | { type: 'stop' };
export type WorkerMessage = { type: 'record'; record: SimRecord } | { type: 'ready'; engine?: 'port'; inspected?: true } | { type: 'invalid-driver'; message: string };

const load = async (module: string): Promise<SimGame<GameTypes> | PortSimGame<PortTypes>> =>
  ((await import(module)) as { simGame: SimGame<GameTypes> | PortSimGame<PortTypes> }).simGame;

/** Inspect the actual module in isolation; a checkpoint's own engine tag never justifies accepting it. */
export function executionKind(request: Pick<RunRequest, 'module' | 'worker' | 'gameTimeoutMs' | 'hidden' | 'debug' | 'hasten'>): Promise<'kernel' | 'port' | undefined> {
  return new Promise(resolve => {
    let worker: Worker;
    try { worker = boot(request, { module: request.module, invariants: false, inspectOnly: true, hidden: request.hidden, debug: request.debug, hasten: request.hasten }); }
    catch { resolve(undefined); return; }
    let settled = false;
    const finish = (kind?: 'kernel' | 'port'): void => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate(); resolve(kind);
    };
    const timer = setTimeout(() => finish(), request.gameTimeoutMs ?? 30_000);
    worker.on('message', (message: WorkerMessage) => { if (message.type === 'ready') finish(message.inspected === true ? message.engine === 'port' ? 'port' : 'kernel' : undefined); });
    worker.on('error', () => finish());
    worker.on('exit', () => finish());
  });
}

/** Play every game in this thread. */
export async function runInThread(request: RunRequest, onRecord?: (r: SimRecord) => void): Promise<SimRecord[]> {
  const game = await load(request.module);
  for (const name of driverNames(request)) game.validateDriver?.(name);
  const content = await game.content();
  const was = isChecking();
  const froze = isFreezing();
  setInvariantChecking(request.invariants ?? true);
  setStateFreezing(false);
  try {
    return request.specs.map((spec) => {
      const r = playOne(game, content, spec, request.until, { view: request.view, hasten: request.hasten, debug: request.debug, hidden: request.hidden });
      onRecord?.(r);
      return r;
    });
  } finally {
    setInvariantChecking(was);
    setStateFreezing(froze);
  }
}

function boot(request: Pick<RunRequest, 'worker'>, input: WorkerInput): Worker {
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

const driverNames = (request: RunRequest): string[] =>
  [...new Set([...request.specs.map((spec) => spec.driver), ...(request.preflightDriverNames ?? [])])];

async function lane(request: RunRequest, names: readonly string[], next: () => GameSpec | undefined, collect: (r: SimRecord) => void): Promise<void> {
  const input: WorkerInput = { module: request.module, driverNames: names, invariants: request.invariants ?? true, until: request.until, view: request.view, hasten: request.hasten, debug: request.debug, hidden: request.hidden };
  for (;;) {
    let held: GameSpec | undefined;
    let stopped = false;
    let again = false;
    let timedOut = false;
    let portGame = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const w = boot(request, input);
        w.on('message', (m: WorkerMessage) => {
          if (timedOut) return;
          clearTimeout(timer);
          if (m.type === 'invalid-driver') {
            reject(typeof m.message === 'string' ? new DriverRegistrationError(m.message) : new Error('invalid simulation worker registration response'));
            return;
          }
          if (m.type === 'ready') portGame = m.engine === 'port';
          if (m.type === 'record') {
            const r = m.record;
            const current = portGame ? r.portExecution === 1 : r.triggerCapChecked === true;
            collect(!current && r.error === undefined && !r.violations?.length
              ? crashRecord(r, new Error(portGame ? 'worker lacks current EnginePort execution evidence; rebuild the worker bundle' : 'worker lacks trigger-cap validation; rebuild the worker bundle'))
              : r);
          }
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
      if (isDriverRegistrationError(e) || request.specs.length === 0) throw e;
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
    const names = driverNames(request);
    await Promise.all(Array.from({ length: count }, () => lane(request, names, next, collect)));
  }
  return records.sort((a, b) => a.index - b.index);
}
