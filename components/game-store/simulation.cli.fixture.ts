import { pathToFileURL } from 'node:url';
import { CONTENT, COUNTER, RULES, type Counter } from '../engine-core/fake/counter.ts';
import { fuzzMain, randomDriver } from '../sim-pool/index.ts';
import type { GameDef } from './index.ts';
import { simGameOf } from './sim.ts';

export const definition: GameDef<Counter, null> = {
  rules: COUNTER,
  content: CONTENT,
  seats: ['solo'],
  start: (seed) => {
    if (seed.startsWith('never-setup')) throw new Error('setup should not run');
    return { options: { seed }, rules: RULES };
  },
  view: () => null,
  opponent: (_view, prompt) => [prompt.options[0]?.id ?? ''],
};
export const simGame = simGameOf(definition, {
  drivers: { custom: { ...randomDriver<Counter>(), name: 'weighted' } },
  aliases: { legacy: 'custom' },
});
const { opponent: _opponent, ...solo } = definition;
export const noOpponent = simGameOf(solo);

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = await fuzzMain(process.argv.slice(2), import.meta.url);
}
