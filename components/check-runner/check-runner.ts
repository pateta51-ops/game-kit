// The checks of `npm run check`, run side by side in lanes instead of one after the other (from EBR; `--pr` mode and the
// timing summary from STCC). Every check runs exactly as `npm run <script>`; only the order changes. FIRST runs alone
// before any lane (timing-sensitive tests); each lane runs its scripts one after the other; the lanes run at the same
// time. Each check writes its own log, printed whole when it ends (a passing check folded as a group, a failing one
// open); every check runs even when another failed; the run fails when any check failed. Cancel and timeout kill the
// check's whole process tree (a process group on Linux, taskkill /t on Windows).
// The lanes come from the game's config (check-runner.config.json, or --config path). The run FAILS while the lanes
// and the package.json check chain (+ `extra`) disagree: a check added to one and not the other. `--pr` runs the
// config's `pr` subset instead (its scripts must exist in package.json and be in the check chain or `extra`).
//
//   tsx check-runner.ts [--config path] [--pr]
//
// Adding a check: put it in the check chain (or, for a CI-only step, in `extra`) and in a lane.

import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, mkdtempSync, openSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Plan {
  /** Run alone, one after the other, before the lanes start. */
  first: string[];
  /** Each lane runs its scripts one after the other; the lanes run at the same time, after `first`. */
  lanes: string[][];
}
export interface Config extends Plan {
  /** The package.json script that chains the checks. */
  checkScript: string;
  /** CI steps besides the check chain that the lanes take over. */
  extra: string[];
  /** The `--pr` subset. */
  pr?: Plan;
  timeoutMinutes: number;
  graceSeconds: number;
}
export const DEFAULT_CONFIG: Config = { first: [], lanes: [], checkScript: 'check', extra: [], timeoutMinutes: 30, graceSeconds: 20 };

/** The scripts `npm run check` chains (`npm run a && npm run b && ...`). */
export function checkScripts(check: string): string[] {
  return check.split('&&').map((s) => {
    const m = /^npm run ([\w:-]+)$/.exec(s.trim());
    if (!m) throw new Error(`check-runner: "npm run check" holds "${s.trim()}", which is not "npm run <script>"`);
    return m[1]!;
  });
}

/** Problems when the lanes and the check chain + extra differ (a check added to one and not the other). */
export function coverageProblems(check: string, cfg: Config, scripts?: Record<string, string>): string[] {
  const chain = checkScripts(check);
  const plan = scripts === undefined ? cfg : (cfg.pr ?? cfg);
  const have = [...plan.first, ...plan.lanes.flat()];
  const out: string[] = [];
  if (scripts === undefined) {
    const want = [...chain, ...cfg.extra];
    for (const s of want) if (!have.includes(s)) out.push(`${s} is a CI check but in no lane`);
    for (const s of have) if (!want.includes(s)) out.push(`${s} is in a lane but neither in "npm run check" nor in extra`);
  } else {
    for (const s of have) if (scripts[s] === undefined) out.push(`${s} is in the --pr lanes but is no package.json script`);
    for (const s of have) if (!chain.includes(s) && !cfg.extra.includes(s)) out.push(`${s} is in the --pr lanes but neither in "npm run check" nor in extra`);
  }
  for (const s of new Set(have)) if (have.filter((x) => x === s).length > 1) out.push(`${s} is in more than one lane (or in first and a lane)`);
  return out;
}

interface Done {
  script: string;
  code: number;
  ms: number;
}

let TIMEOUT_MS = 30 * 60_000;
/** After SIGTERM, how long a check's processes get before SIGKILL. */
let GRACE_MS = 20_000;
const POSIX = process.platform !== 'win32';

/** Signals the check's whole process tree: npm, its shell and tsx/vitest/workers (a process group on Linux). */
function killTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try {
    if (POSIX) process.kill(-pid, signal);
    else spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
  } catch {
    // already gone
  }
}

/** The checks still running (their process-group leaders). */
const running = new Set<number | undefined>();
let stopping = false;

/** A cancelled job (the runner sends SIGINT, then SIGTERM) stops every check's tree too: they are in their own groups. */
function forwardStop(signal: NodeJS.Signals): void {
  process.once(signal, () => {
    stopping = true; // no lane starts its next check
    for (const pid of running) killTree(pid, 'SIGTERM');
    setTimeout(() => {
      for (const pid of running) killTree(pid, 'SIGKILL');
      process.exit(1);
    }, GRACE_MS).unref();
    process.exitCode = 1;
  });
}

function runScript(script: string, log: string): Promise<Done> {
  const t0 = Date.now();
  const fd = openSync(log, 'w');
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', script], {
      stdio: ['ignore', fd, fd],
      shell: !POSIX, // npm is npm.cmd there
      detached: POSIX, // its own process group, so a timeout reaches every process the check started
      env: process.env,
    });
    running.add(child.pid);
    let kill: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      appendFileSync(log, `\ncheck-runner: npm run ${script} passed the ${TIMEOUT_MS / 60_000} min limit; stopping it\n`);
      killTree(child.pid, 'SIGTERM');
      kill = setTimeout(() => killTree(child.pid, 'SIGKILL'), GRACE_MS);
    }, TIMEOUT_MS);
    const end = (code: number) => {
      clearTimeout(timer);
      if (kill) {
        clearTimeout(kill);
        killTree(child.pid, 'SIGKILL'); // whatever of the tree outlived npm
      }
      closeSync(fd);
      resolve({ script, code, ms: Date.now() - t0 });
    };
    child.on('error', (e) => {
      appendFileSync(log, `\ncheck-runner: could not start npm run ${script}: ${e.message}\n`);
      end(1);
    });
    child.on('close', (code, signal) => {
      if (signal) appendFileSync(log, `\ncheck-runner: npm run ${script} stopped by ${signal}\n`);
      running.delete(child.pid);
      end(code ?? 1);
    });
  });
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export async function main(argv: readonly string[]): Promise<void> {
  const args = [...argv];
  const at = args.indexOf('--config');
  const file = at >= 0 ? (args.splice(at, 2)[1] ?? '') : 'check-runner.config.json';
  const cfg: Config = { ...DEFAULT_CONFIG, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>) };
  const pr = args.includes('--pr');
  if (pr && cfg.pr === undefined) {
    console.error('check-runner: --pr needs a "pr" plan in the config');
    process.exitCode = 1;
    return;
  }
  const FIRST = pr ? (cfg.pr?.first ?? []) : cfg.first;
  const LANES = pr ? (cfg.pr?.lanes ?? []) : cfg.lanes;
  TIMEOUT_MS = cfg.timeoutMinutes * 60_000;
  GRACE_MS = cfg.graceSeconds * 1000;
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
  const problems = coverageProblems(pkg.scripts[cfg.checkScript] ?? '', cfg, pr ? pkg.scripts : undefined);
  if (problems.length) {
    console.error(`check-runner: the lanes do not match the CI checks:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  forwardStop('SIGINT');
  forwardStop('SIGTERM');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'check-runner-'));
  const t0 = Date.now();
  console.log(`check-runner: first ${FIRST.join(' → ')} alone, then ${LANES.length} lanes: ${LANES.map((l) => l.join(' → ')).join(' | ')}`);
  const results: Done[] = [];
  const print = (d: Done, log: string) => {
    const head = `npm run ${d.script}: ${d.code === 0 ? 'passed' : `FAILED (exit ${d.code})`} in ${secs(d.ms)}`;
    const text = readFileSync(log, 'utf8');
    if (d.code === 0) console.log(`::group::${head}\n${text}\n::endgroup::`);
    else console.log(`::error::${head}\n${'='.repeat(80)}\n${head}\n${'='.repeat(80)}\n${text}\n${'='.repeat(80)}`);
  };
  const lane = async (scripts: string[]) => {
    for (const script of scripts) {
      if (stopping) break;
      const log = path.join(dir, `${script.replace(/:/g, '_')}.log`);
      const d = await runScript(script, log);
      results.push(d);
      print(d, log); // whole, as soon as the check ends: a log is never interleaved with another
    }
  };
  await lane(FIRST); // a failure here still runs every lane: each check reports
  await Promise.all(LANES.map(lane));
  const failed = results.filter((r) => r.code !== 0);
  const order = [...FIRST, ...LANES.flat()];
  const rows = [...results].sort((a, b) => order.indexOf(a.script) - order.indexOf(b.script));
  const table = rows.map((r) => `| ${r.script} | ${r.code === 0 ? 'passed' : `FAILED (exit ${r.code})`} | ${secs(r.ms)} |`);
  const head = `Checks side by side: ${results.length - failed.length} of ${results.length} passed in ${secs(Date.now() - t0)} (wall clock)`;
  const added = results.reduce((sum, x) => sum + x.ms, 0);
  console.log(`${head}\n${rows.map((r) => `  ${r.script.padEnd(26)} ${r.code === 0 ? 'passed' : 'FAILED'}  ${secs(r.ms)}`).join('\n')}`);
  console.log(`wall ${secs(Date.now() - t0)}, checks added up ${secs(added)}, ${String(os.availableParallelism())} cores`);
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary) appendFileSync(summary, `### ${head}\n\n| Check | Result | Time |\n| --- | --- | --- |\n${table.join('\n')}\n\n`);
  if (failed.length) {
    console.error(`check-runner: failed: ${failed.map((r) => r.script).join(', ')} (their logs are printed above, open)`);
    process.exitCode = 1; // never process.exit(): it cut the long logs still on their way to the runner
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) void main(process.argv.slice(2));
