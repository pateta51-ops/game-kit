// Some rules end the game in the middle of a procedure. The procedure that sets `result` throws `GameOver`; `applyAction` and `createGame` catch it and
// return the state at that instant.

/** Thrown after `s.result` is set, to stop the enclosing procedure at once. Never a player mistake. */
export class GameOver extends Error {
  constructor() {
    super('game over');
    this.name = 'GameOver';
  }
}
