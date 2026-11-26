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
//   node check-runner.ts [--config path] [--pr] [--fail-fast] [--keep-going]
//
// `--fail-fast` (or `"failFast": true` in the config; from STCC): the first failing check stops the checks still running
// (their whole trees) and no further check starts; its output is printed again after the summary. `--keep-going` runs
// everything whatever the config says.
//
// Opt-in, config only (from STCC's scripts/ci/check.ts): `"stream": true` prints every output line as it arrives, prefixed
// `[lane]` (`laneNames`, else the lane's first script), with `[lane] > script` / `[lane] < script ok in 1.2s` around a
// check, instead of each log whole at its end; a failing check's output is printed again after the summary.
// `"npmSilent": true` runs `npm run --silent <script>`. `"skipLastAfterFailure": true` does not start `last` once a
// check failed (`--keep-going` still runs it).
//
// Adding a check: put it in the check chain (or, for a CI-only step, in `extra`) and in a lane.

import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, mkdtempSync, openSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { acceptanceReceipt, type ReceiptConfig } from './receipt.ts';

export interface Plan {
  /** Run alone, one after the other, before the lanes start. */
  first: string[];
  /** Each lane runs its scripts one after the other; the lanes run at the same time, after `first`. */
  lanes: string[][];
  /** Run alone, one after the other, after every lane ended (wall-clock budgets). */
  last?: string[];
  /** In `pr` only: the pull-request job's own scripts, which need not be in the check chain or `extra`. */
  own?: string[];
  /** With `stream`: the `[lane]` prefix of each lane, in order (default: the lane's first script). */
  laneNames?: string[];
}
export interface Config extends Plan {
  /** The package.json script that chains the checks. */
  checkScript: string;
  /** CI steps besides the check chain that the lanes take over. */
  extra: string[];
  /** The `--pr` subset. */
  pr?: Plan;
  /** Stop at the first failing check (`--keep-going` overrides). */
  failFast?: boolean;
  /** Print each output line as it arrives, prefixed `[lane]`, instead of each check's log whole at its end. */
  stream?: boolean;
  /** Run `npm run --silent <script>`. */
  npmSilent?: boolean;
  /** Do not start `last` once a check failed (`--keep-going` overrides). */
  skipLastAfterFailure?: boolean;
  /** Variables per script (`*`: every script); a value starting with `~/` is under the home folder. */
  env?: Record<string, Record<string, string>>;
  timeoutMinutes: number;
  graceSeconds: number;
  /** Opt-in evidence bound to a clean consumer, its kit pin and supplied acceptance inputs. */
  receipt?: ReceiptConfig;
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
  const have = [...plan.first, ...plan.lanes.flat(), ...(plan.last ?? [])];
  const out: string[] = [];
  if (scripts === undefined) {
    const want = [...chain, ...cfg.extra];
    for (const s of want) if (!have.includes(s)) out.push(`${s} is a CI check but in no lane`);
    for (const s of have) if (!want.includes(s)) out.push(`${s} is in a lane but neither in "npm run check" nor in extra`);
  } else {
    for (const s of have) if (scripts[s] === undefined) out.push(`${s} is in the --pr lanes but is no package.json script`);
    for (const s of have) if (!chain.includes(s) && !cfg.extra.includes(s) && !plan.own?.includes(s)) out.push(`${s} is in the --pr lanes but neither in "npm run check" nor in extra`);
  }
  for (const s of new Set(have)) if (have.filter((x) => x === s).length > 1) out.push(`${s} is in more than one lane (or in first and a lane)`);
  return out;
}

interface Done {
  script: string;
  code: number;
  ms: number;
  /** Ended because another check failed (fail-fast), not by its own result. */
  stopped: boolean;
  timedOut: boolean;
  truncated: boolean;
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
let bailed = false;
const killed = new Set<number>();

/** Fail-fast: stops the checks still running; no lane starts its next check. */
function bail(): void {
  bailed = true;
  for (const pid of running) {
    if (pid !== undefined) killed.add(pid);
    killTree(pid, 'SIGTERM');
  }
  setTimeout(() => {
    for (const pid of running) killTree(pid, 'SIGKILL');
  }, GRACE_MS).unref();
}

/** A cancelled job (the runner sends SIGINT, then SIGTERM) stops every check's tree too: they are in their own groups. */
function forwardStop(signal: NodeJS.Signals): void {
  process.once(signal, () => {
    stopping = true; // no lane starts its next check
    for (const pid of running) {
      if (pid !== undefined) killed.add(pid);
      killTree(pid, 'SIGTERM');
    }
    setTimeout(() => {
      for (const pid of running) killTree(pid, 'SIGKILL');
      process.exit(1);
    }, GRACE_MS).unref();
    process.exitCode = 1;
  });
}

/** The environment of a script: the config's `*` and its own variables over the process's. */
export function envOf(env: Config['env'], script: string): NodeJS.ProcessEnv {
  const set = Object.entries({ ...env?.['*'], ...env?.[script] }).map(([k, v]) => [k, v.startsWith('~/') ? path.join(os.homedir(), v.slice(2)) : v]);
  return { ...process.env, ...(Object.fromEntries(set) as Record<string, string>) };
}

function runScript(script: string, log: string, env: NodeJS.ProcessEnv = process.env, silent = false, lane?: string): Promise<Done> {
  const t0 = performance.now();
  const fd = openSync(log, 'w');
  return new Promise((resolve) => {
    const child = spawn('npm', silent ? ['run', '--silent', script] : ['run', script], {
      stdio: lane === undefined ? ['ignore', fd, fd] : ['ignore', 'pipe', 'pipe'],
      shell: !POSIX, // npm is npm.cmd there
      detached: POSIX, // its own process group, so a timeout reaches every process the check started
      env,
    });
    running.add(child.pid);
    const reader = () => {
      let pending = '';
      return (chunk?: Buffer): void => {
        if (!chunk && pending === '') return;
        const lines = (pending + (chunk?.toString('utf8') ?? '\n')).split(/\r?\n/);
        pending = lines.pop() ?? '';
        for (const line of lines) {
          appendFileSync(log, `${line}\n`);
          console.log(`[${lane ?? ''}] ${line}`);
        }
      };
    };
    const out = reader();
    const err = reader();
    let idle: NodeJS.Timeout | undefined;
    let exited: (() => void) | undefined;
    const wake = (f: (c?: Buffer) => void) => (c: Buffer) => {
      f(c);
      exited?.();
    };
    child.stdout?.on('data', wake(out));
    child.stderr?.on('data', wake(err));
    let kill: NodeJS.Timeout | undefined;
    let timedOut = false;
    let truncated = false;
    const timer = setTimeout(() => {
      timedOut = true;
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
      resolve({ script, code, ms: Math.round(performance.now() - t0), stopped: child.pid !== undefined && killed.has(child.pid), timedOut, truncated });
    };
    child.on('error', (e) => {
      appendFileSync(log, `\ncheck-runner: could not start npm run ${script}: ${e.message}\n`);
      end(1);
    });
    let ended = false;
    const fin = (code: number | null, signal: NodeJS.Signals | null) => {
      if (ended) return;
      ended = true;
      clearTimeout(idle);
      out();
      err();
      child.stdout?.destroy();
      child.stderr?.destroy();
      if (signal) appendFileSync(log, `\ncheck-runner: npm run ${script} stopped by ${signal}\n`);
      running.delete(child.pid);
      end(code ?? 1);
    };
    child.on('close', fin);
    // streamed: `close` waits for every holder of the pipes (a background process the check left); `exit` does not
    if (lane !== undefined)
      child.on('exit', (code, signal) => {
        exited = () => {
          clearTimeout(idle);
          idle = setTimeout(() => { truncated = true; fin(code, signal); }, 3000);
        };
        exited();
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
  const failFast = !args.includes('--keep-going') && (args.includes('--fail-fast') || cfg.failFast === true);
  if (pr && cfg.pr === undefined) {
    console.error('check-runner: --pr needs a "pr" plan in the config');
    process.exitCode = 1;
    return;
  }
  const FIRST = pr ? (cfg.pr?.first ?? []) : cfg.first;
  const LANES = pr ? (cfg.pr?.lanes ?? []) : cfg.lanes;
  const LAST = (pr ? cfg.pr?.last : cfg.last) ?? [];
  TIMEOUT_MS = cfg.timeoutMinutes * 60_000;
  GRACE_MS = cfg.graceSeconds * 1000;
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
  const problems = coverageProblems(pkg.scripts[cfg.checkScript] ?? '', cfg, pr ? pkg.scripts : undefined);
  if (problems.length) {
    console.error(`check-runner: the lanes do not match the CI checks:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }
  const order = [...FIRST, ...LANES.flat(), ...LAST];
  if (cfg.receipt && pr) throw new Error('acceptance receipts require the full declared check plan');
  const receipt = cfg.receipt ? acceptanceReceipt(cfg.receipt, file, pkg.scripts, order) : undefined;
  forwardStop('SIGINT');
  forwardStop('SIGTERM');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'check-runner-'));
  const t0 = performance.now();
  console.log(`check-runner: first ${FIRST.join(' → ')} alone, then ${LANES.length} lanes: ${LANES.map((l) => l.join(' → ')).join(' | ')}${LAST.length ? `, then ${LAST.join(' → ')} alone` : ''}`);
  const results: Done[] = [];
  const logOf = (script: string) => path.join(dir, `${String(order.indexOf(script))}.log`);
  const state = (d: Done) => (d.stopped ? 'stopped' : d.code === 0 ? 'passed' : `FAILED (exit ${d.code})`);
  const print = (d: Done, log: string) => {
    const head = `npm run ${d.script}: ${state(d)} in ${secs(d.ms)}`;
    const text = readFileSync(log, 'utf8');
    if (d.code === 0 || d.stopped) console.log(`::group::${head}\n${text}\n::endgroup::`);
    else console.log(`::error::${head}\n${'='.repeat(80)}\n${head}\n${'='.repeat(80)}\n${text}\n${'='.repeat(80)}`);
  };
  const lane = async (scripts: string[], name?: string) => {
    for (const script of scripts) {
      if (stopping || bailed) break;
      const log = logOf(script);
      const tag = name ?? script;
      if (cfg.stream) console.log(`[${tag}] > ${script}`);
      const d = await runScript(script, log, envOf(cfg.env, script), cfg.npmSilent, cfg.stream ? tag : undefined);
      results.push(d);
      receipt?.record(d, log);
      if (cfg.stream) console.log(`[${tag}] < ${script} ${d.code === 0 ? 'ok' : state(d)} in ${(d.ms / 1000).toFixed(1)}s`);
      else print(d, log); // whole, as soon as the check ends: a log is never interleaved with another
      if (failFast && d.code !== 0 && !bailed) bail();
    }
  };
  await lane(FIRST); // a failure here still runs every lane: each check reports
  const names = pr ? cfg.pr?.laneNames : cfg.laneNames;
  await Promise.all(LANES.map((l, i) => lane(l, names?.[i] ?? l[0])));
  if (cfg.skipLastAfterFailure && !args.includes('--keep-going') && results.some((r) => r.code !== 0 && !r.stopped)) {
    if (LAST.length) console.log(`check-runner: a check failed; not starting ${LAST.join(', ')}`);
  } else await lane(LAST);
  const failed = results.filter((r) => r.code !== 0 && !r.stopped);
  const rows = [...results].sort((a, b) => order.indexOf(a.script) - order.indexOf(b.script));
  const table = rows.map((r) => `| ${r.script} | ${state(r)} | ${secs(r.ms)} |`);
  const elapsed = secs(Math.round(performance.now() - t0));
  const head = `Checks side by side: ${results.filter((r) => r.code === 0).length} of ${results.length} passed in ${elapsed} (wall clock)`;
  const added = results.reduce((sum, x) => sum + x.ms, 0);
  console.log(`${head}\n${rows.map((r) => `  ${r.script.padEnd(26)} ${r.code === 0 ? 'passed' : r.stopped ? 'stopped' : 'FAILED'}  ${secs(r.ms)}`).join('\n')}`);
  console.log(`wall ${elapsed}, checks added up ${secs(added)}, ${String(os.availableParallelism())} cores`);
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary) appendFileSync(summary, `### ${head}\n\n| Check | Result | Time |\n| --- | --- | --- |\n${table.join('\n')}\n\n`);
  if (failed.length) {
    if (failFast || cfg.stream) for (const r of failed) console.log(`\n=== FAILED: npm run ${r.script} (exit ${r.code}) - its output again ===\n${readFileSync(logOf(r.script), 'utf8')}`);
    console.error(`check-runner: failed: ${failed.map((r) => r.script).join(', ')} (their logs are printed above, open)`);
    process.exitCode = 1; // never process.exit(): it cut the long logs still on their way to the runner
  }
  if (receipt && receipt.finish(stopping) !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) void main(process.argv.slice(2));
