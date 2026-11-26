import { botDriverOf, simGameOf } from '../kit/game-store/sim.ts';
import { COURIER_DEF, COURIER_PILOT, courierView } from './engine/courier.ts';

export const courierSim = simGameOf(COURIER_DEF, {
  drivers: { 'courier-pilot': botDriverOf(COURIER_DEF, COURIER_PILOT) },
  summary: courierView,
  viewValidation: { leakKeys: () => ['rng', 'stack'] },
  maxActions: 5,
});
