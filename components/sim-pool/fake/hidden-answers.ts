import { botDriver, greedyBot, legalAnswers, type SimGame } from '../browser.ts';
import { probe, simGame as example, view, type Game, type View } from './public-greedy.ts';

/** A real preview, with two equally good public fallback choices at the first prompt. */
const base: SimGame<Game> = {
  ...example,
  reshuffleHidden: state => ({ ...state, deck: [...state.deck].reverse() }),
  answers: (state, _content, rng) => legalAnswers(state.prompt!, rng),
  driver: (name) => botDriver<Game, View>(greedyBot({ probe, fallback: () => 0, ties: name === 'seeded' ? 'random' : 'first' }), view),
};

export const forMode = (mode: string): SimGame<Game> => ({
  ...base,
  answers(state, content, rng) {
    const options = base.answers!(state, content, rng);
    if (state.prompt?.kind !== 'open') return options;
    // Both draw and luck must use the public fallback. Both remain legal in either world.
    const tied = options.filter(a => a.picks[0] === 'draw' || a.picks[0] === 'luck');
    const secret = state.deck[0];
    if (mode === 'order' && secret === 9) tied.reverse();
    if (mode === 'payload') return tied.map(a => ({ ...a, privateCard: secret }));
    if (mode === 'empty' || (mode === 'other-empty' && secret === 9)) return [];
    rng.nextUint32();
    return tied;
  },
});

// The fuzz worker loads this module in plain Node for the regression, just like a game's sim entry.
export const simGame = forMode('order');
