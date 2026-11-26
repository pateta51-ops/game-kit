// A simulation worker thread (pool.ts): plays the games it is sent, one at a time, and sends each record back.
import { parentPort, workerData } from 'node:worker_threads';
import { setInvariantChecking, setStateFreezing, type GameTypes, type PortTypes } from '../engine-core/index.ts';
import { isDriverRegistrationError, playOne, type SimGame } from './play.ts';
import { isPortSimGame, portOptionProblem, type PortSimGame } from './port.ts';
import type { WorkerCommand, WorkerInput, WorkerMessage } from './pool.ts';

const port = parentPort;
if (port === null) throw new Error('worker.ts runs only as a worker thread');
const input = workerData as WorkerInput;
async function preflight(): Promise<SimGame<GameTypes> | PortSimGame<PortTypes> | undefined> {
  try {
    const game = ((await import(input.module)) as { simGame: SimGame<GameTypes> | PortSimGame<PortTypes> }).simGame;
    for (const name of input.driverNames ?? []) game.validateDriver?.(name);
    return game;
  } catch (error) {
    if (!isDriverRegistrationError(error)) throw error;
    port?.postMessage({ type: 'invalid-driver', message: error.message } satisfies WorkerMessage);
    port?.close();
    return undefined;
  }
}

const game = await preflight();
if (game) {
  if (input.inspectOnly) {
    const portGame = isPortSimGame(game);
    port.postMessage({ type: 'ready', ...(!portGame || portOptionProblem(game, input) === undefined ? { inspected: true } : {}), ...(portGame ? { engine: 'port' } : {}) } satisfies WorkerMessage);
    port.close();
  } else {
    const content = await game.content();
    setStateFreezing(false); // a simulation never keeps a state
    setInvariantChecking(input.invariants);
    port.on('message', (c: WorkerCommand) => {
      if (c.type === 'stop') port.close();
      else port.postMessage({ type: 'record', record: playOne(game, content, c.spec, input.until, { view: input.view, hasten: input.hasten, debug: input.debug, hidden: input.hidden }) } satisfies WorkerMessage);
    });
    port.postMessage({ type: 'ready', ...(isPortSimGame(game) ? { engine: 'port' } : {}) } satisfies WorkerMessage);
  }
}
