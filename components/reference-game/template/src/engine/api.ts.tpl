// The one file the UI and scripts may import from src/engine.
export { cardText, CHECKS, CONTENT, defOf, GAME, LIMIT, SEATS, TIMING, VERBS, viewOf, WORDS, type Level, type Ref, type RefEvent, type RefPrompt, type RefStep, type RefState, type RefView, type Seat } from './rules.ts';
export { AUTOMA, BOTS, TIERS } from './automa.ts';
export { BONUS, logAfter, NEXT, playerOf, startOf, STEPS } from './campaign.ts';
export { REF } from './game.ts';
export { applyAction, createGame, hashState, type SaveFile } from '../../kit/engine-core/index.ts';
