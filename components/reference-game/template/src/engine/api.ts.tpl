// The one file the UI and scripts may import from src/engine.
export { cardText, CONTENT, GAME, VERBS, greedyPicks, RULES, viewOf, type Ref, type RefPrompt, type RefStep, type RefState, type RefView, type Seat } from './rules';
export { appendAction, applyAction, createGame, hashState, newHistory, recordAction, type History } from '../../kit/engine-core/index';
