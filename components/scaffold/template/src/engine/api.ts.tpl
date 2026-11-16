// The one file the UI and scripts may import from src/engine.
export { CONTENT, RULES, STUB, type Stub, type StubEvent, type StubState } from './rules';
export { applyAction, createGame, hashState } from '../../kit/engine-core/index';
