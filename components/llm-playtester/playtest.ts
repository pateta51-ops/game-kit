// Headless Claude playtests through a game adapter.
//   node playtest.ts --adapter <module> [--seed s] [--difficulty d] [--scenario s] [--model m] [--max-usd 5]
//     [--max-decisions n] [--runs n] [--docs a.md,b.md] [--env .env.local] [--out logs/llm-player] [--dummy]
// The module exports createAdapter() or a default (an adapter or a function returning one). Exit 0 every run ended,
// 1 a run stopped on a finding or a cap, 2 bad usage.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cost, MAX_TOKENS, PRICES, sdkChooser, worstCost, type Chooser, type Usage } from './client.ts';
import { loadKey } from './key.ts';

export interface GameAdapter {
  name: string;
  rulesText(): string;
  start(o: { seed: string; difficulty?: string; scenario?: string }): void;
  view(): string;
  options(): string[];
  choose(i: number): void;
  done(): null | { won: boolean; summary: string };
  replay(): unknown;
}
export interface PlaytestOptions {
  seed: string;
  difficulty?: string;
  scenario?: string;
  model?: string;
  maxUsd?: number;
  maxDecisions?: number;
  /** max_tokens per call (default 16000: thinking models need room before the tool call). */
  maxTokens?: number;
  dummy?: boolean;
  /** Extra docs added to the system prompt after rulesText(). */
  docs?: string[];
  /** Injected chooser (tests, or a game's own client); otherwise the SDK with the key from `env`. */
  client?: Chooser;
  /** The file holding <GAME>_CLAUDE_API_KEY; default .env.local in the working directory. */
  env?: string;
  out?: string;
  /** Past decisions sent with each view (default 6), so the prompt stays flat. */
  history?: number;
  /** Where the pre-call cost estimate is printed (default console.log). */
  log?: (s: string) => void;
  /** Called after every paid call with its cost and the run id, so a caller can record spend even when the run throws. */
  /** A finding seen this many times (same normalised key) stops the run; default 3. */
  maxRepeats?: number;
  onSpend?: (costUsd: number, runId: string) => void;
}
export interface PlaytestResult {
  runId: string;
  dir: string;
  result: null | { won: boolean; summary: string };
  stop: 'done' | 'max-decisions' | 'max-usd' | 'finding';
  decisions: number;
  costUsd: number;
  findings: string[];
  /** Each distinct finding (first text) with how often it was seen. */
  findingCounts: { finding: string; count: number }[];
}

const HOW =
  'You are playtesting a board game adaptation. Each turn you get the current view and numbered options; you must answer by calling the choose tool (always call it, never reply in plain text): the option number and a short reason. Play to win. When the view, the options or the rules look wrong (an illegal option offered, a legal one missing, a wrong count, unclear text), start the reason with BUG: and say what.';

const findingKey = (f: string) => f.toLowerCase().replace(/^step \d+:\s*/, '').replace(/\(step \d+, option \d+\)/g, '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const short = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);

export async function runPlaytest(adapter: GameAdapter, opts: PlaytestOptions): Promise<PlaytestResult> {
  const model = opts.model ?? 'claude-opus-5-5';
  if (!opts.dummy && PRICES[model] === undefined) throw new Error(`Unknown model ${model}; use ${Object.keys(PRICES).join(' or ')}`);
  const maxUsd = opts.maxUsd ?? 5;
  const maxDecisions = opts.maxDecisions ?? 500;
  if (!(Number.isFinite(maxUsd) && maxUsd > 0)) throw new Error(`maxUsd must be a positive number, not ${String(maxUsd)}`);
  if (!(Number.isFinite(maxDecisions) && maxDecisions > 0))
    throw new Error(`maxDecisions must be a positive number, not ${String(maxDecisions)}`);
  const runId = `${adapter.name}-${opts.seed}-${new Date().toISOString().replace(/[:.]/g, '-')}`.replace(/[^\w.-]/g, '_');
  const dir = join(opts.out ?? join('logs', 'llm-player'), runId);
  mkdirSync(dir, { recursive: true });
  const log = join(dir, 'decisions.jsonl');
  writeFileSync(log, '');
  const seen = new Map<string, { finding: string; count: number }>();
  let last = '';
  const maxRepeats = opts.maxRepeats ?? 3;
  const note = (f: string, norm = false) => {
    last = norm ? findingKey(f) : `${seen.size}|${f}`;
    const e = seen.get(last);
    if (e === undefined) seen.set(last, { finding: f, count: 1 });
    else e.count++;
    return seen.get(last)!.count >= maxRepeats && maxRepeats > 1;
  };
  const recent: string[] = [];
  let spent = 0;
  let decisions = 0;
  let stop: PlaytestResult['stop'] = 'finding';
  let result: PlaytestResult['result'] = null;
  const maxTokens = opts.maxTokens ?? MAX_TOKENS;
  const choose: Chooser | null = opts.dummy
    ? null
    : (opts.client ?? (await sdkChooser(loadKey(adapter.name, opts.env ?? '.env.local'), maxTokens)));
  const attempt = <T>(what: string, f: () => T): T | undefined => {
    try {
      return f();
    } catch (e) {
      note(`adapter threw in ${what}: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  };
  let system: string[] = [];
  if (attempt('start', () => {
    adapter.start({
      seed: opts.seed,
      ...(opts.difficulty === undefined ? {} : { difficulty: opts.difficulty }),
      ...(opts.scenario === undefined ? {} : { scenario: opts.scenario }),
    });
    system = [`${HOW}\n\n${adapter.rulesText()}`, ...(opts.docs ?? []).map((p) => readFileSync(p, 'utf8'))];
    return true;
  })) {
    play: for (;;) {
      const end = attempt('done', () => adapter.done());
      if (end === undefined) break;
      if (end !== null) {
        result = end;
        stop = 'done';
        break;
      }
      if (decisions >= maxDecisions) {
        stop = 'max-decisions';
        break;
      }
      const view = attempt('view', () => adapter.view());
      const options = attempt('options', () => adapter.options());
      if (view === undefined || options === undefined) break;
      if (options.length === 0) {
        note(`step ${decisions}: no options and the game is not over`);
        break;
      }
      let choice = 0;
      let reason = 'dummy';
      let usage: Usage | null = null;
      let paid = 0;
      if (choose !== null) {
        let error = '';
        for (let tries = 0; ; tries++) {
          const prompt = `${recent.length ? `Your last decisions:\n${recent.join('\n')}\n\n` : ''}Current view:\n${view}\n\nOptions:\n${options.map((o, i) => `${i}. ${o}`).join('\n')}${error}`;
          const ask = { model, system, prompt, maxTokens };
          const worst = worstCost(ask, maxTokens);
          if (decisions === 0 && tries === 0) {
            const say = opts.log ?? console.log;
            say(`Cost estimate: up to $${worst.toFixed(4)} per decision (${model}), cap $${maxUsd}`);
            if (worst > maxUsd) {
              const m = `the first call alone could cost $${worst.toFixed(4)}, over the cap of $${maxUsd}: raise --max-usd`;
              say(m);
              note(m);
            }
          }
          if (spent + worst > maxUsd) {
            stop = 'max-usd';
            break play;
          }
          const a = await choose(ask);
          const c = cost(a.usage, model);
          spent += c;
          opts.onSpend?.(c, runId);
          paid += c;
          usage = a.usage;
          choice = a.option;
          reason = a.reason;
          if (Number.isInteger(choice) && choice >= 0 && choice < options.length) break;
          const none = Number.isNaN(choice);
          note(none ? `step ${decisions}: ${a.stop_reason === 'max_tokens' ? `reply cut off at max_tokens (${maxTokens}) before a choose tool call` : 'reply had no choose tool call'}` : `step ${decisions}: invalid option ${String(choice)} of ${options.length}`);
          if (tries >= 1) {
            appendFileSync(log, JSON.stringify({ step: decisions, view: short(view), options, choice, reason, usage, cost: paid }) + '\n');
            break play;
          }
          error = none
            ? `\n\nReminder: you must call the choose tool with option (0 to ${options.length - 1}) and reason.`
            : `\n\nYour answer ${String(choice)} is not an option: answer a number from 0 to ${options.length - 1}.`;
        }
      }
      const viewHash = createHash('sha1').update(view).digest('hex').slice(0, 12);
      appendFileSync(log, JSON.stringify({ step: decisions, viewHash, view: short(view), options, choice, reason, usage, cost: paid }) + '\n');
      const repeated = /^\s*BUG:/i.test(reason) && note(`step ${decisions}: ${reason}`, true);
      recent.push(`${decisions}: ${short(options[choice]!, 80)} (${short(reason, 120)})`);
      if (recent.length > (opts.history ?? 6)) recent.shift();
      decisions++;
      if (repeated) break;
      if (attempt('choose', () => (adapter.choose(choice), true)) === undefined) {
        seen.get(last)!.finding += ` (step ${decisions - 1}, option ${choice})`;
        break;
      }
    }
  }
  const counts = [...seen.values()];
  const findings = counts.map((c) => c.finding);
  const replay = attempt('replay', () => adapter.replay());
  writeFileSync(join(dir, 'replay.json'), JSON.stringify(replay ?? null, null, 1) + '\n');
  writeFileSync(
    join(dir, 'summary.md'),
    [
      `# ${adapter.name} playtest ${runId}`,
      '',
      `- Result: ${result === null ? `stopped (${stop})` : `${result.won ? 'won' : 'lost'}: ${result.summary}`}`,
      `- Model: ${opts.dummy ? 'dummy (first option)' : model}`,
      `- Seed: ${opts.seed}${opts.difficulty ? `, difficulty ${opts.difficulty}` : ''}${opts.scenario ? `, scenario ${opts.scenario}` : ''}`,
      `- Decisions: ${decisions}`,
      `- Cost: $${spent.toFixed(4)} of $${maxUsd}`,
      '',
      '## Findings',
      '',
      ...(findings.length ? counts.map((c) => `- ${c.finding}${c.count > 1 ? ` (x${c.count})` : ''}`) : ['none']),
      '',
    ].join('\n'),
  );
  if (result !== null) (opts.log ?? console.log)(`PLAYTEST ENDED ${result.won ? 'won' : 'lost'} after ${decisions} turns`);
  return { runId, dir, result, stop, decisions, costUsd: spent, findings, findingCounts: counts };
}

export interface MainResult {
  code: number;
  runs: PlaytestResult[];
  /** Everything paid in this invocation, including a run that threw. */
  totalUsd: number;
  error?: Error;
}
/** Sum of costUsd in a spend ledger (jsonl); 0 when the file is missing. */
export function ledgerSpent(file: string): number {
  if (!existsSync(file)) return 0;
  let n = 0;
  readFileSync(file, 'utf8').split('\n').forEach((l, i) => {
    if (l.trim() === '') return;
    let c: unknown;
    try {
      c = (JSON.parse(l) as { costUsd?: unknown }).costUsd;
    } catch {
      throw new Error(`spend ledger ${file} line ${i + 1} is not valid JSON`);
    }
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) throw new Error(`spend ledger ${file} line ${i + 1} has no valid costUsd`);
    n += c;
  });
  return n;
}

export async function main(argv: string[], log: (s: string) => void = console.log, env: Record<string, string | undefined> = process.env, client?: Chooser): Promise<number> {
  const r = await runMain(argv, log, env, client);
  if (r.error !== undefined) throw r.error;
  return r.code;
}

export async function runMain(argv: string[], log: (s: string) => void = console.log, env: Record<string, string | undefined> = process.env, injected?: Chooser): Promise<MainResult> {
  const bad = (): MainResult => ({ code: usage(log), runs: [], totalUsd: 0 });
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) return bad();
    if (a === '--dummy' || a === '--require-cap') flags.set(a.slice(2), '1');
    else if (argv[i + 1] === undefined) return bad();
    else flags.set(a.slice(2), argv[++i]!);
  }
  const path = flags.get('adapter');
  if (path === undefined) return bad();
  if (env['HEAVY_HELD'] === '1' && !flags.has('dummy') && injected === undefined) { log('REFUSED: a paid run under the heavy queue (HEAVY_HELD=1); it waits on an API, not the CPU, so run it directly, never under `heavy run` (--dummy is fine)'); return { code: 2, runs: [], totalUsd: 0 }; }
  const g = (k: string) => flags.get(k);
  const ledger = g('ledger') ?? env['PLAYTEST_LEDGER'];
  const capRaw = g('total-cap') ?? env['PLAYTEST_TOTAL_CAP_USD'];
  const capSet = capRaw !== undefined && capRaw !== '';
  const cap = capSet ? Number(capRaw) : Number.NaN;
  if (capSet && !(cap > 0)) return bad();
  if ((flags.has('require-cap') || env['PLAYTEST_REQUIRE_CAP'] === '1') && !capSet) {
    log('no total cap set (--total-cap or PLAYTEST_TOTAL_CAP_USD): refusing to start');
    return { code: 2, runs: [], totalUsd: 0 };
  }
  for (const k of ['max-usd', 'max-decisions', 'runs', 'max-tokens']) {
    const v = flags.get(k);
    if (v !== undefined && !(Number.isFinite(Number(v)) && Number(v) > 0 && (k !== 'max-tokens' || Number.isInteger(Number(v))))) return bad();
  }
  const mod = (await import(pathToFileURL(resolve(path)).href)) as { createAdapter?: () => GameAdapter; default?: GameAdapter | (() => GameAdapter) };
  const adapter = mod.createAdapter?.() ?? (typeof mod.default === 'function' ? mod.default() : mod.default);
  if (adapter === undefined) return bad();
  const seed = flags.get('seed') ?? '1';
  const runs = Number(flags.get('runs') ?? 1);
  let left = Number(flags.get('max-usd') ?? 5);
  let code = 0;
  const done: PlaytestResult[] = [];
  let totalUsd = 0;
  if (capSet) {
    let spent: number;
    try {
      spent = ledger === undefined ? 0 : ledgerSpent(ledger);
    } catch (e) {
      log(`${(e as Error).message}: refusing to start`);
      return { code: 2, runs: done, totalUsd };
    }
    left = Math.min(left, cap - spent);
    log(`Spent so far $${spent.toFixed(4)} of the $${cap} total cap; this call may spend $${Math.max(0, left).toFixed(4)}`);
    if (left <= 0) return { code: 1, runs: done, totalUsd };
  }
  const client = flags.has('dummy') ? undefined : injected ?? await sdkChooser(loadKey(adapter.name, g('env') ?? '.env.local'), g('max-tokens') === undefined ? undefined : Number(g('max-tokens')));
  for (let r = 0; r < runs; r++) {
    const o: PlaytestOptions = { seed: runs > 1 ? `${seed}-${r + 1}` : seed, maxUsd: left, dummy: flags.has('dummy') };
    for (const [k, f] of [['difficulty', 'difficulty'], ['scenario', 'scenario'], ['model', 'model'], ['env', 'env'], ['out', 'out']] as const) {
      const v = g(f);
      if (v !== undefined) o[k] = v;
    }
    if (g('max-decisions') !== undefined) o.maxDecisions = Number(g('max-decisions'));
    if (g('max-tokens') !== undefined) o.maxTokens = Number(g('max-tokens'));
    if (g('docs') !== undefined) o.docs = g('docs')!.split(',');
    if (client !== undefined) o.client = client;
    o.log = log;
    o.onSpend = (c, runId) => {
      totalUsd += c;
      if (ledger !== undefined) {
        mkdirSync(dirname(resolve(ledger)), { recursive: true });
        appendFileSync(ledger, JSON.stringify({ runId, seed: o.seed, costUsd: c, at: new Date().toISOString() }) + '\n');
      }
    };
    let res: PlaytestResult;
    try {
      res = await runPlaytest(adapter, o);
    } catch (error) {
      return { code: 1, runs: done, totalUsd, error: error instanceof Error ? error : new Error(String(error)) };
    }
    left -= res.costUsd;
    done.push(res);
    log(`${res.runId}: ${res.result === null ? `stopped (${res.stop})` : res.result.won ? 'won' : 'lost'}, ${res.decisions} decisions, $${res.costUsd.toFixed(4)}, ${res.findings.length} findings -> ${res.dir}`);
    if (res.stop !== 'done') code = 1;
    if (res.stop === 'max-usd' || (capSet && left <= 0)) break;
  }
  return { code, runs: done, totalUsd };
}

function usage(log: (s: string) => void): number {
  log('usage: node playtest.ts --adapter <module> [--seed s] [--difficulty d] [--scenario s] [--model claude-opus-5-5|claude-sonnet-5-5] [--max-usd 5] [--max-decisions n] [--runs n] [--docs a.md,b.md] [--env .env.local] [--out dir] [--dummy] [--ledger spend.jsonl] [--total-cap usd] [--require-cap]');
  return 2;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
