// The guarded task loop (ported from Warp's Edge core/runner.ts). `run` pops tasks off the LIFO
// stack and executes them until the stack is empty, a prompt is open, or the game is over. A runaway loop (a handler that
// keeps scheduling itself) aborts with an EngineBugError instead of hanging the tab or a simulation.
import { draftOf } from './ctx';
import type { Draft } from './draft';
import { EngineBugError } from './errors';
import type { Ctx, GameTypes, HandlerTable, KernelState } from './types';

/** Tasks executed in one `applyAction` before the runner gives up. */
export const MAX_TASKS_PER_ACTION = 50_000;

/** `run`. A task whose kind has no handler is an engine bug. */
export function run<G extends GameTypes>(ctx: Ctx<G>, table: HandlerTable<G>): void {
  const s = draftOf(ctx) as Draft<KernelState>;
  let executed = 0;
  while (s.prompt === null && s.stack.length > 0 && s.result === null) {
    const task = s.stack.pop() as G['task'];
    const handler = table[task.kind];
    if (handler === undefined) throw new EngineBugError(`no handler for task kind "${task.kind}"`);
    handler(ctx, task);
    executed += 1;
    if (executed > MAX_TASKS_PER_ACTION) {
      throw new EngineBugError(
        `runaway task loop: more than ${String(MAX_TASKS_PER_ACTION)} tasks in one action`,
      );
    }
  }
  // once the game is over no task and no prompt remain
  if (s.result !== null) {
    s.stack = [];
    s.prompt = null;
  }
}
