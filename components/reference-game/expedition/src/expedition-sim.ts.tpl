import { botDriverOf, simGameOf } from '../kit/game-store/sim.ts';
import { createExpedition, expeditionView, type ExpeditionConfig } from './engine/expedition.ts';

export function expeditionSim(config: ExpeditionConfig) {
  const { def, pilot } = createExpedition(config);
  return simGameOf(def, {
    drivers: { 'expedition-pilot': botDriverOf(def, pilot) }, summary: expeditionView,
    viewValidation: { leakKeys: () => ['rng', 'stack', 'timing', 'tiles'] }, maxActions: config.points,
  });
}
