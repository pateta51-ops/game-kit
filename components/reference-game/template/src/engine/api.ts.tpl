// The one file the UI and scripts may import from src/engine.
export { cardText, CONTENT, GAME, VERBS, greedyPicks, REF, RULES, SEATS, viewOf, WORDS, type Ref, type RefEvent, type RefPrompt, type RefStep, type RefState, type RefView, type Seat } from './rules.ts';
export { applyAction, createGame, hashState, type SaveFile } from '../../kit/engine-core/index.ts';
