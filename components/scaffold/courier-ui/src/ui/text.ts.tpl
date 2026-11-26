import { plainView, ruleIdFilter } from '../../kit/plain-text/index.ts';
import { CONFIG } from '../engine/api.ts';

export const ids = ruleIdFilter({ long: ['COU'], short: [] });
export { plainView };
export const title = ids.strip('{{name}}');
export const instructions = `Collect the parcel at ${CONFIG.pickup}, then deliver it to ${CONFIG.destination}. Each move costs one. Walls block movement.`;
