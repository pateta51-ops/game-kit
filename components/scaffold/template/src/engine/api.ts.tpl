// The one file the UI and scripts may import from src/engine.
export { CONTENT, GAME_DEF, RULES, STUB, type Stub, type StubEvent, type StubState } from './rules.ts';
export { applyAction, createGame, hashState } from '../../kit/engine-core/index.ts';
