// sim-pool and replay-cli module from the one game object: `simGame` (drivers `opponent`, from each seat's view only, `random`, and `automa`, the same Bot the store plays) and `specs`.
import type { DriverRng } from '../../kit/sim-pool/index.ts';
import { other, type RefState } from './rules.ts';
import type { GoldenSpec } from '../../kit/replay-cli/golden.ts';
import { botDriverOf, simGameOf } from '../../kit/game-store/sim.ts';
import { BOTS } from './automa.ts';
import { REF } from './game.ts';
import { CARD_SETUP } from './card-config.ts';

export const automaDriver = botDriverOf(REF, BOTS[CARD_SETUP.level]);
export function reshuffleHidden(state: RefState, seat: string | number | undefined, rng: DriverRng): RefState {
  if (seat !== '0' && seat !== '1') throw new Error('reference hidden shuffle requires a deciding seat');
  const hand = `hand:${other(seat)}`;
  const deck = state.zones.deck;
  const hiddenHand = state.zones[hand];
  if (deck === undefined || hiddenHand === undefined) throw new Error('reference hidden zones are missing');
  const cards = [...deck.cards, ...hiddenHand.cards];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return { ...state, zones: { ...state.zones,
    deck: { ...deck, cards: cards.slice(0, deck.cards.length) },
    [hand]: { ...hiddenHand, cards: cards.slice(deck.cards.length) },
  } };
}
export const simGame = { ...simGameOf(REF, { drivers: { automa: automaDriver }, summary: (state) => ({ winner: state.result?.winner ?? null }), maxActions: 500 }), reshuffleHidden };

export const specs: readonly GoldenSpec[] = [
  { name: 'opponent-1', driver: 'opponent' },
  { name: 'random-1', driver: 'random' },
  { name: 'automa-1', driver: 'automa' },
];
