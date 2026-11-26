import { botDriverOf, simGameOf } from '../kit/game-store/sim.ts';
import { CONFIG, GAME_DEF, PILOT, courierView, startCourier } from './engine/api.ts';

export const SIM = simGameOf(GAME_DEF, {
  drivers: { 'courier-pilot': botDriverOf(GAME_DEF, PILOT) },
  start: spec => startCourier(spec.seed, spec.settings?.['allowance'] === undefined ? undefined : Number(spec.settings['allowance'])),
  summary: courierView,
  viewValidation: { leakKeys: () => ['rng', 'stack'] },
  maxActions: Math.max(...CONFIG.allowances),
});
