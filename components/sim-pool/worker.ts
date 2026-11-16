// A simulation worker thread (pool.ts): plays the games it is sent, one at a time, and sends each record back.
import { parentPort, workerData } from 'node:worker_threads';
import { setInvariantChecking, setStateFreezing, type GameTypes } from '../engine-core/index';
import { playOne, type SimGame } from './play';
import type { WorkerCommand, WorkerInput, WorkerMessage } from './pool';

const port = parentPort;
if (port === null) throw new Error('worker.ts runs only as a worker thread');
const input = workerData as WorkerInput;
const game = ((await import(input.module)) as { simGame: SimGame<GameTypes> }).simGame;
const content = await game.content();
setStateFreezing(false); // a simulation never keeps a state
setInvariantChecking(input.invariants);
port.on('message', (c: WorkerCommand) => {
  if (c.type === 'stop') port.close();
  else port.postMessage({ type: 'record', record: playOne(game, content, c.spec, input.until) } satisfies WorkerMessage);
});
port.postMessage({ type: 'ready' } satisfies WorkerMessage);
