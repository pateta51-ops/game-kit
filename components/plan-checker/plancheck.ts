// npm run plancheck (BUILD_PLAN §10.1): runs tools/plancheck.py on docs/BUILD_PLAN.md with the first Python 3 it finds,
// so the same command works in the container (python3) and on the owner's Windows PC (python or the py launcher).
// PYTHON names an interpreter to use first. Windows' "python3" may be the Microsoft Store placeholder, which prints a
// message instead of running: an interpreter counts only when `--version` answers "Python 3".
// Exit codes: plancheck's own, or 2 when no Python 3 is found.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PY = fileURLToPath(new URL('./plancheck.py', import.meta.url));

/** The interpreters to try, in order: [command, ...leading arguments]. */
export function candidates(env: Readonly<Record<string, string | undefined>>, platform: string): string[][] {
  const out: string[][] = [];
  const named = env['PYTHON'];
  if (named !== undefined && named !== '') out.push([named]);
  if (platform === 'win32') out.push(['python'], ['py', '-3'], ['python3']);
  else out.push(['python3'], ['python']);
  return out;
}

function isPython3(cmd: string[]): boolean {
  const [exe, ...args] = cmd;
  if (exe === undefined) return false;
  const r = spawnSync(exe, [...args, '--version'], { encoding: 'utf-8' });
  return r.status === 0 && /^Python 3\./.test(`${r.stdout}${r.stderr}`.trim());
}

export function main(argv: readonly string[]): number {
  const python = candidates(process.env, process.platform).find(isPython3);
  if (python === undefined) {
    console.error(
      'plancheck: no Python 3 found (tried PYTHON, python3, python, py -3). Install it with: winget install Python.Python.3.13',
    );
    return 2;
  }
  const [exe, ...lead] = python as [string, ...string[]];
  const args = [...argv];
  const at = args.indexOf('--plan');
  const plan = at >= 0 ? (args.splice(at, 2)[1] ?? '') : 'docs/BUILD_PLAN.md';
  const r = spawnSync(exe, [...lead, PY, plan, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });
  return r.status ?? 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
