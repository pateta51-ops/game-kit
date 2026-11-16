// Runs the games of a simulation in this thread or on worker threads (warps scripts/sim/pool.ts): each worker asks for
// its next game when it finishes one, and records come back in index order, so results never depend on the number of
// workers. A worker that dies (ebr scripts/sim/pool.ts) turns the game it held into a crash record and a new worker
// takes the next games. A worker loads the game's module (`simGame` export); under tsx it registers tsx itself.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { isChecking, isFreezing, setInvariantChecking, setStateFreezing, type GameTypes } from '../engine-core/index';
import { crashRecord, playOne, type GameSpec, type SimGame, type SimRecord } from './play';

export interface RunRequest {
  /** The URL of the module that exports `simGame`. */
  readonly module: string;
  readonly specs: readonly GameSpec[];
  /** Invariant checks on (default true). */
  readonly invariants?: boolean;
  /** A bundled worker (the bundle of worker.ts); default worker.ts under tsx. */
  readonly worker?: string;
  /** Stop each game after this many applied actions (a replay to a step). */
  readonly until?: number | undefined;
}

export interface WorkerInput {
  readonly module: string;
  readonly invariants: boolean;
  readonly until?: number | undefined;
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
      const r = playOne(game, content, spec, request.until);
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
  const api = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href;
  const entry = new URL('./worker.ts', import.meta.url).href;
  const code = `import { register } from ${JSON.stringify(api)}; register(); await import(${JSON.stringify(entry)});`;
  return new Worker(code, { eval: true, workerData: input });
}

async function lane(request: RunRequest, next: () => GameSpec | undefined, collect: (r: SimRecord) => void): Promise<void> {
  const input: WorkerInput = { module: request.module, invariants: request.invariants ?? true, until: request.until };
  for (;;) {
    let held: GameSpec | undefined;
    let stopped = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const w = boot(request, input);
        w.on('message', (m: WorkerMessage) => {
          if (m.type === 'record') collect(m.record);
          held = next();
          if (held === undefined) {
            stopped = true;
            w.postMessage({ type: 'stop' } satisfies WorkerCommand);
          } else w.postMessage({ type: 'play', spec: held } satisfies WorkerCommand);
        });
        w.on('error', reject);
        w.on('exit', (code) => {
          if (stopped && code === 0) resolve();
          else reject(new Error(`a simulation worker stopped with exit code ${String(code)}`));
        });
      });
      return;
    } catch (e) {
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
  if (count === 1) await runInThread(request, collect);
  else {
    let at = 0;
    const next = (): GameSpec | undefined => request.specs[at++];
    await Promise.all(Array.from({ length: count }, () => lane(request, next, collect)));
  }
  return records.sort((a, b) => a.index - b.index);
}
