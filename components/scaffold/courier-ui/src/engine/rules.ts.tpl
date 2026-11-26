import { createCourier } from './courier.ts';
import { CONFIG } from './courier-config.ts';

const courier = createCourier(CONFIG);
export const GAME_DEF = courier.def;
export const COURIER = GAME_DEF.rules;
export const CONTENT = GAME_DEF.content;
export const PILOT = courier.pilot;
export const startCourier = courier.start;
