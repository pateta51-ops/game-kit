import { useSyncExternalStore } from 'react';
import { createGameStore, type GameSnap } from '../../kit/game-store/index.ts';
import { GAME_DEF, type Stub, type StubState } from '../engine/api.ts';

export const game = createGameStore(GAME_DEF, { seat: 'me', undo: 'free' });
export const useGame = (): GameSnap<Stub, StubState> => useSyncExternalStore(game.subscribe, game.get);
