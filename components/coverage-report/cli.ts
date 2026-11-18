// node kit/coverage-report/cli.ts <module> [--json] [--strict]: the module default-exports a CoverageInput.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCli, type CoverageInput } from './index.ts';

const file = process.argv[2];
if (!file || file.startsWith('--')) {
  console.error('usage: node cli.ts <module> [--json] [--strict]');
  process.exit(2);
}
const mod = (await import(pathToFileURL(resolve(file)).href)) as { default: CoverageInput<unknown> };
process.exitCode = runCli(mod.default, process.argv.slice(3));
