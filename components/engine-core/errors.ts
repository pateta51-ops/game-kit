// BUILD_PLAN §4.4: the ways the engine throws (ported from Warp's Edge). The UI sends only answers that `validateAction`
// accepted; `applyAction` throws `IllegalActionError` for one that is not (a bug in the caller), and `EngineBugError` when
// an internal invariant breaks.

/** An internal invariant broke: a bug in the engine or in content the validator should have refused (§4.4, §5.1). */
export class EngineBugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineBugError';
  }
}

/**
 * `createGame` was handed options it cannot build a game from: an unknown starting kingdom, mode or rules setting
 * (§4.5, §5.2).
 */
export class GameSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameSetupError';
  }
}

/** `applyAction` was handed an action the open prompt does not accept; `message` is `validateAction`'s refusal. */
export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

/**
 * Reaching something a later batch implements is a bug in the caller, never a silent no-op: an op the interpreter does
 * not know yet fails loudly instead of resolving to nothing. `batch` names the batch of §11.4 (e.g. 'S6').
 */
export const notYet = (what: string, batch: string): EngineBugError =>
  new EngineBugError(`${what} arrives with batch ${batch}`);
