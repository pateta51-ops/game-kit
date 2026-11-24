// K723: the browser-safe part of sim-pool (no `node:` module, directly or through an import); use it from UI code and vite.
export { DriverRng } from './rng.ts';
export { ANSWER_CAP, bySeat, legalAnswers, randomDriver, type Driver, type GameSpec, type SimGame } from './play.ts';
export { botDriver, type Bot } from './bot.ts';
export { greedyBot, type GreedyOptions, type GreedyProbe } from './greedy.ts';
