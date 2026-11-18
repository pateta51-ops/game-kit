// Headless Claude playtests through a game adapter.
//   node playtest.ts --adapter <module> [--seed s] [--difficulty d] [--scenario s] [--model m] [--max-usd 5]
//     [--max-decisions n] [--runs n] [--docs a.md,b.md] [--env .env.local] [--out logs/llm-player] [--dummy]
// The module exports createAdapter() or a default (an adapter or a function returning one). Exit 0 every run ended,
// 1 a run stopped on a finding or a cap, 2 bad usage.
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cost, PRICES, sdkChooser, worstCost, type Chooser, type Usage } from './client.ts';
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
}
export interface PlaytestResult {
  runId: string;
  dir: string;
  result: null | { won: boolean; summary: string };
  stop: 'done' | 'max-decisions' | 'max-usd' | 'finding';
  decisions: number;
  costUsd: number;
  findings: string[];
}

const HOW =
  'You are playtesting a board game adaptation. Each turn you get the current view and numbered options; answer with the choose tool: the option number and a short reason. Play to win. When the view, the options or the rules look wrong (an illegal option offered, a legal one missing, a wrong count, unclear text), start the reason with BUG: and say what.';

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
  const findings: string[] = [];
  const recent: string[] = [];
  let spent = 0;
  let decisions = 0;
  let stop: PlaytestResult['stop'] = 'finding';
  let result: PlaytestResult['result'] = null;
  const choose: Chooser | null = opts.dummy
    ? null
    : (opts.client ?? (await sdkChooser(loadKey(adapter.name, opts.env ?? '.env.local'))));
  const attempt = <T>(what: string, f: () => T): T | undefined => {
    try {
      return f();
    } catch (e) {
      findings.push(`adapter threw in ${what}: ${e instanceof Error ? e.message : String(e)}`);
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
        findings.push(`step ${decisions}: no options and the game is not over`);
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
          const ask = { model, system, prompt };
          if (spent + worstCost(ask) > maxUsd) {
            stop = 'max-usd';
            break play;
          }
          const a = await choose(ask);
          const c = cost(a.usage, model);
          spent += c;
          paid += c;
          usage = a.usage;
          choice = a.option;
          reason = a.reason;
          if (Number.isInteger(choice) && choice >= 0 && choice < options.length) break;
          findings.push(`step ${decisions}: invalid option ${String(choice)} of ${options.length}`);
          if (tries >= 1) {
            appendFileSync(log, JSON.stringify({ step: decisions, view: short(view), options, choice, reason, usage, cost: paid }) + '\n');
            break play;
          }
          error = `\n\nYour answer ${String(choice)} is not an option: answer a number from 0 to ${options.length - 1}.`;
        }
      }
      const viewHash = createHash('sha1').update(view).digest('hex').slice(0, 12);
      appendFileSync(log, JSON.stringify({ step: decisions, viewHash, view: short(view), options, choice, reason, usage, cost: paid }) + '\n');
      if (/^\s*BUG:/i.test(reason)) findings.push(`step ${decisions}: ${reason}`);
      recent.push(`${decisions}: ${short(options[choice]!, 80)} (${short(reason, 120)})`);
      if (recent.length > (opts.history ?? 6)) recent.shift();
      decisions++;
      if (attempt('choose', () => (adapter.choose(choice), true)) === undefined) {
        findings[findings.length - 1] += ` (step ${decisions - 1}, option ${choice})`;
        break;
      }
    }
  }
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
      ...(findings.length ? findings.map((f) => `- ${f}`) : ['none']),
      '',
    ].join('\n'),
  );
  return { runId, dir, result, stop, decisions, costUsd: spent, findings };
}

export async function main(argv: string[], log: (s: string) => void = console.log): Promise<number> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) return usage(log);
    if (a === '--dummy') flags.set('dummy', '1');
    else if (argv[i + 1] === undefined) return usage(log);
    else flags.set(a.slice(2), argv[++i]!);
  }
  const path = flags.get('adapter');
  if (path === undefined) return usage(log);
  for (const k of ['max-usd', 'max-decisions', 'runs']) {
    const v = flags.get(k);
    if (v !== undefined && !(Number.isFinite(Number(v)) && Number(v) > 0)) return usage(log);
  }
  const mod = (await import(pathToFileURL(resolve(path)).href)) as { createAdapter?: () => GameAdapter; default?: GameAdapter | (() => GameAdapter) };
  const adapter = mod.createAdapter?.() ?? (typeof mod.default === 'function' ? mod.default() : mod.default);
  if (adapter === undefined) return usage(log);
  const seed = flags.get('seed') ?? '1';
  const runs = Number(flags.get('runs') ?? 1);
  let left = Number(flags.get('max-usd') ?? 5);
  let code = 0;
  const g = (k: string) => flags.get(k);
  const client = flags.has('dummy') ? undefined : await sdkChooser(loadKey(adapter.name, g('env') ?? '.env.local'));
  for (let r = 0; r < runs; r++) {
    const o: PlaytestOptions = { seed: runs > 1 ? `${seed}-${r + 1}` : seed, maxUsd: left, dummy: flags.has('dummy') };
    for (const [k, f] of [['difficulty', 'difficulty'], ['scenario', 'scenario'], ['model', 'model'], ['env', 'env'], ['out', 'out']] as const) {
      const v = g(f);
      if (v !== undefined) o[k] = v;
    }
    if (g('max-decisions') !== undefined) o.maxDecisions = Number(g('max-decisions'));
    if (g('docs') !== undefined) o.docs = g('docs')!.split(',');
    if (client !== undefined) o.client = client;
    const res = await runPlaytest(adapter, o);
    left -= res.costUsd;
    log(`${res.runId}: ${res.result === null ? `stopped (${res.stop})` : res.result.won ? 'won' : 'lost'}, ${res.decisions} decisions, $${res.costUsd.toFixed(4)}, ${res.findings.length} findings -> ${res.dir}`);
    if (res.stop !== 'done') code = 1;
    if (res.stop === 'max-usd') break;
  }
  return code;
}

function usage(log: (s: string) => void): number {
  log('usage: node playtest.ts --adapter <module> [--seed s] [--difficulty d] [--scenario s] [--model claude-opus-5-5|claude-sonnet-5-5] [--max-usd 5] [--max-decisions n] [--runs n] [--docs a.md,b.md] [--env .env.local] [--out dir] [--dummy]');
  return 2;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
