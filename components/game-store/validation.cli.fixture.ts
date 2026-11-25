import { pathToFileURL } from 'node:url';
import { DriverRegistrationError, fuzzMain, runGames, runResumable } from '../sim-pool/index.ts';

const module = new URL('./validation.game.fixture.ts', import.meta.url).href;
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  const worker = process.env.PROBE_WORKER;
  const view = process.env.PROBE_VIEW === '1';
  if (args[0] === '--probe-games') {
    const specs = Array.from({ length: 6 }, (_, index) => ({ index, driver: args[2] ?? 'opponent', seed: `probe-${String(index)}` }));
    const records = await runGames({ module, specs, view }, Number(args[1]));
    process.stdout.write(`${JSON.stringify(records)}\n`);
  } else if (args[0] === '--probe-batch') {
    const scenario = args[1];
    const specs = ['alias', 'unnamed', 'bot'].map((driver, index) => ({ index, driver, seed: `probe-${String(index)}` }));
    if (scenario !== 'valid' && scenario !== 'old-evidence') specs[1] = { index: 1, driver: 'gredey', seed: 'historical' };
    try {
      const request = { module, specs: scenario === 'cached' || scenario === 'old-evidence' ? specs.slice(1, 2) : specs, view, gameTimeoutMs: 3000, ...(worker === undefined ? {} : { worker }) };
      const file = process.env.PROBE_CHECKPOINT;
      const records = file ? await runResumable(request, 2, file, 'compatible') : await runGames(request, 2);
      process.stdout.write(`${JSON.stringify(records)}\n`);
      process.exitCode = records.some(record => record.error !== undefined) ? 1 : 0;
    } catch (error) {
      process.stdout.write(`${String(error)}\n`);
      process.exitCode = error instanceof DriverRegistrationError ? 2 : 1;
    }
  } else process.exitCode = await fuzzMain(args, module, { view, ...(worker === undefined ? {} : { worker }) });
}
