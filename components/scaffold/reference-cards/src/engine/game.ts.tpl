// The one game object (`defineGame`) the store, sims, replay-cli and the opponent read; the opponent is the automa Bot of the game's level.
import { emptyLog } from '../../kit/campaign/index.ts';
import { autoAnswer } from '../../kit/prompt-host/index.ts';
import { botOpponent, defineGame } from '../../kit/game-store/index.ts';
import { CARD_SETUP } from './card-config.ts';
import { BOTS } from './automa.ts';
import { startOf } from './campaign.ts';
import { CONTENT, GAME, SEATS, viewOf, WORDS, type Ref, type RefPrompt, type RefView, type Seat } from './rules.ts';

export const REF = defineGame<Ref, RefView, Seat>({
  rules: GAME,
  content: CONTENT,
  seats: SEATS,
  start: (seed) => startOf(seed, { level: CARD_SETUP.level, bots: ['1'], scenario: 'first' }, emptyLog()),
  view: viewOf,
  forced: (p) => autoAnswer(p, true),
  opponent: (v, p, rng) => botOpponent<RefView, RefPrompt>(BOTS[v.level])(v, p, rng),
  words: WORDS,
});
