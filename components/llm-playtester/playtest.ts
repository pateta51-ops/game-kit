// Headless Claude playtests through a game adapter.
//   node playtest.ts --adapter <module> [--seed s] [--difficulty d] [--scenario s] [--model m] [--max-usd 5]
//     [--max-decisions n] [--runs n] [--docs a.md,b.md] [--env .env.local] [--out logs/llm-player] [--dummy]
// The module exports createAdapter() or a default (an adapter or a function returning one). Exit 0 every run ended,
// 1 a run stopped on a finding or a cap, 2 bad usage.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cost, MAX_TOKENS, PRICES, sdkChooser, worstCost, type Answer, type Chooser, type Usage } from './client.ts';
import { loadKey } from './key.ts';

export interface GameAdapter {
  name: string;
  rulesText(): string;
  start(o: { seed: string; difficulty?: string; scenario?: string }): void;
  view(): string;
  /** Plain options (strings or labelled items with an optional group), or one multi-select or split question. */
  options(): Option[] | MultiSelect | Split;
  choose(i: number): void;
  /** K741: the assembled answer to a MultiSelect (picked item indices, ascending) or a Split (points per target). */
  answer?(values: number[]): void;
  /** K741: a lookup table (e.g. full card texts by short name) sent once in the cached system prompt, so view() can name things. */
  reference?(): string;
  done(): null | { won: boolean; summary: string };
  replay(): unknown;
}
export interface Item {
  label: string;
  group?: string;
}
export type Option = string | Item;
/** Pick min..max of the items; asked one item per call, with "done" once min is reached. */
export interface MultiSelect {
  kind: 'multi';
  title?: string;
  min: number;
  max: number;
  items: Option[];
}
/** Allocate `points` over the targets (each min..max, default 0..points); asked one target per call, the last one forced. */
export interface Split {
  kind: 'split';
  title?: string;
  points: number;
  targets: (Item & { min?: number; max?: number })[];
}
export interface PlaytestOptions {
  seed: string;
  difficulty?: string;
  scenario?: string;
  model?: string;
  maxUsd?: number;
  maxDecisions?: number;
  /** max_tokens per call (default 8000, K741: the largest reply seen in two real runs was 4,592 tokens; thinking models need room before the tool call). */
  maxTokens?: number;
  /** output_config.effort sent with each call (default low). */
  effort?: 'low' | 'medium' | 'high';
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
  /** A finding seen this many times (same normalised key) stops the run; default 3, 0 = never. */
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
  'You are playtesting a board game adaptation. Each turn you get the current view and numbered options; you must answer by calling the choose tool (always call it, never reply in plain text): the option number and a reason of one sentence, at most 20 words. Play to win. When the view, the options or the rules look wrong (an illegal option offered, a legal one missing, a wrong count, unclear text), start the reason with BUG: and say what.';

const findingKey = (f: string) => f.toLowerCase().replace(/^step \d+:\s*/, '').replace(/\s+/g, ' ').replace(/[\s.!;:,]+$/, '').trim();
const item = (o: Option): Item => (typeof o === 'string' ? { label: o } : o);
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
    return seen.get(last)!.count >= maxRepeats && maxRepeats > 0;
  };
  const recent: string[] = [];
  let spent = 0;
  let decisions = 0;
  let stop: PlaytestResult['stop'] = 'finding';
  let result: PlaytestResult['result'] = null;
  const maxTokens = opts.maxTokens ?? MAX_TOKENS;
  const effort = opts.effort ?? 'low';
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
  let estimated = false;
  let dups = 0;
  // K741: one call per question. A plain list is answered with `option`, a MultiSelect with `picks`, a Split with `points`;
  // the runner validates, retries once with the error, then logs a finding. A forced answer makes no call (logged auto).
  // Null: the run stops (stop is set).
  interface Q { want: string; dummy: number[]; forced?: number[] | undefined; check(a: Answer): string | number[]; say(v: number[]): string }
  const ask = async (view: string, items: Item[], head: string, q: Q): Promise<number[] | null> => {
    if (decisions >= maxDecisions) {
      stop = 'max-decisions';
      return null;
    }
    const n = new Map<string, number>();
    const options = items.map((it) => {
      const k = `${it.group ?? ''}\u0000${it.label}`;
      const c = (n.get(k) ?? 0) + 1;
      n.set(k, c);
      if (c === 2) dups++;
      return c > 1 ? `${it.label} #${c}` : it.label;
    });
    let g: string | undefined;
    const list = items.map((it, i) => (it.group !== g ? ((g = it.group), `[${g ?? 'other'}]\n`) : '') + `${i}. ${options[i]}`).join('\n');
    let v = q.dummy;
    let reason = 'dummy';
    let usage: Usage | null = null;
    let paid = 0;
    const auto = choose !== null && q.forced !== undefined;
    if (auto) {
      v = q.forced!;
      reason = 'auto: the only answer';
    } else if (choose !== null) {
      let error = '';
      for (let tries = 0; ; tries++) {
        const prompt = `${recent.length ? `Your last decisions:\n${recent.join('\n')}\n\n` : ''}Current view:\n${view}\n\n${head ? `${head}\n\n` : ''}Options:\n${list}${error}`;
        const ask = { model, system, prompt, maxTokens, effort };
        const worst = worstCost(ask, maxTokens);
        if (!estimated) {
          estimated = true;
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
          return null;
        }
        const a = await choose(ask);
        const c = cost(a.usage, model);
        spent += c;
        opts.onSpend?.(c, runId);
        paid += c;
        usage = a.usage;
        reason = a.reason;
        const r = q.check(a);
        if (typeof r !== 'string') {
          v = r;
          break;
        }
        const none = Number.isNaN(a.option) && a.picks === undefined && a.points === undefined;
        note(none ? `step ${decisions}: ${a.stop_reason === 'max_tokens' ? `reply cut off at max_tokens (${maxTokens}) before a choose tool call` : 'reply had no choose tool call'}` : `step ${decisions}: ${r}`);
        if (tries >= 1) {
          appendFileSync(log, JSON.stringify({ step: decisions, view: short(view), options, choice: a.picks ?? a.points ?? a.option, reason, usage, cost: paid }) + '\n');
          return null;
        }
        error = none ? `\n\nReminder: you must call the choose tool with ${q.want} and reason.` : `\n\nYour answer is not valid (${r}): answer with ${q.want}.`;
      }
    }
    const viewHash = createHash('sha1').update(view).digest('hex').slice(0, 12);
    appendFileSync(log, JSON.stringify({ step: decisions, viewHash, view: short(view), ...(head ? { ask: short(head) } : {}), options, choice: q.want.startsWith('option') ? v[0] : v, ...(auto ? { auto } : {}), reason, usage, cost: paid }) + '\n');
    const repeated = /^\s*BUG:/i.test(reason) && note(`step ${decisions}: ${reason}`, true);
    recent.push(`${decisions}: ${short(q.say(v), 80)} (${short(reason, 120)})`);
    if (recent.length > (opts.history ?? 6)) recent.shift();
    decisions++;
    return repeated ? null : v;
  };
  const ints = (x: unknown, len: number): x is number[] => Array.isArray(x) && x.length === len && x.every((i) => Number.isInteger(i));
  let system: string[] = [];
  if (attempt('start', () => {
    adapter.start({
      seed: opts.seed,
      ...(opts.difficulty === undefined ? {} : { difficulty: opts.difficulty }),
      ...(opts.scenario === undefined ? {} : { scenario: opts.scenario }),
    });
    const ref = adapter.reference?.();
    system = [`${HOW}\n\n${adapter.rulesText()}`, ...(opts.docs ?? []).map((p) => readFileSync(p, 'utf8')), ...(ref ? [`Reference (what the view and options name):\n${ref}`] : [])];
    return true;
  })) {
    for (;;) {
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
      const o = attempt('options', () => adapter.options());
      if (view === undefined || o === undefined) break;
      if (Array.isArray(o)) {
        if (o.length === 0) {
          note(`step ${decisions}: no options and the game is not over`);
          break;
        }
        const items = o.map(item);
        const v = await ask(view, items, '', {
          want: `option (0 to ${items.length - 1})`,
          dummy: [0],
          forced: items.length === 1 ? [0] : undefined,
          check: (a) => (Number.isInteger(a.option) && a.option >= 0 && a.option < items.length ? [a.option] : `invalid option ${String(a.option)} of ${items.length}`),
          say: (v) => item(o[v[0]!]!).label,
        });
        if (v === null) break;
        if (attempt('choose', () => (adapter.choose(v[0]!), true)) === undefined) {
          seen.get(last)!.finding += ` (step ${decisions - 1}, option ${v[0]})`;
          break;
        }
        continue;
      }
      let v: number[] | null;
      if (o.kind === 'multi') {
        const items = o.items.map(item);
        if (!(Number.isInteger(o.min) && Number.isInteger(o.max) && o.min >= 0 && o.min <= o.max && o.min <= items.length)) {
          note(`step ${decisions}: adapter question invalid: multi-select of ${o.min} to ${o.max} from ${items.length} items`);
          break;
        }
        const max = Math.min(o.max, items.length);
        v = await ask(view, items, `${o.title ?? 'Pick'}: choose ${o.min} to ${max} of these items in one answer: picks, the list of their numbers.`, {
          want: `picks (${o.min} to ${max} different numbers from 0 to ${items.length - 1})`,
          dummy: items.slice(0, o.min).map((_, i) => i),
          forced: o.min === items.length ? items.map((_, i) => i) : undefined,
          check: (a) => {
            const p = a.picks;
            if (!Array.isArray(p) || !ints(p, p.length)) return 'picks must be a list of item numbers';
            if (new Set(p).size !== p.length || p.some((i) => i < 0 || i >= items.length)) return `picks must be different numbers from 0 to ${items.length - 1}`;
            if (p.length < o.min || p.length > max) return `pick ${o.min} to ${max} items, not ${p.length}`;
            return [...p].sort((x, y) => x - y);
          },
          say: (v) => `picked ${v.map((i) => items[i]!.label).join('; ') || 'none'}`,
        });
      } else {
        const t = o.targets;
        const lim = t.map((u) => [u.min ?? 0, u.max ?? o.points] as const);
        const sum = (k: 0 | 1) => lim.reduce((n, l) => n + l[k], 0);
        if (t.length === 0 || !Number.isInteger(o.points) || o.points > sum(1) || o.points < sum(0)) {
          note(`step ${decisions}: adapter question invalid: split of ${o.points} over ${t.length} targets (limits ${sum(0)} to ${sum(1)})`);
          break;
        }
        v = await ask(view, t, `${o.title ?? 'Split'}: allocate exactly ${o.points} points over these targets in one answer: points, one number per target in this order (limits: ${t.map((_, i) => `${i}: ${lim[i]![0]}-${lim[i]![1]}`).join(', ')}).`, {
          want: `points (${t.length} numbers, total ${o.points})`,
          dummy: (() => {
            let left = o.points - sum(0);
            return lim.map(([lo, hi]) => {
              const x = Math.min(hi - lo, left);
              left -= x;
              return lo + x;
            });
          })(),
          forced: t.length === 1 || o.points === sum(1) ? lim.map((l) => (t.length === 1 ? o.points : l[1])) : undefined,
          check: (a) => {
            const p = a.points;
            if (!ints(p, t.length)) return `points must be ${t.length} whole numbers`;
            const bad = p.findIndex((x, i) => x < lim[i]![0] || x > lim[i]![1]);
            if (bad >= 0) return `${t[bad]!.label} must get ${lim[bad]![0]} to ${lim[bad]![1]}, not ${p[bad]}`;
            const s = p.reduce((n, x) => n + x, 0);
            return s === o.points ? p : `points must total ${o.points}, not ${s}`;
          },
          say: (v) => v.map((x, i) => `${t[i]!.label} ${x}`).join('; '),
        });
      }
      if (v === null) break;
      const w = v;
      if (attempt('answer', () => (adapter.answer!(w), true)) === undefined) {
        seen.get(last)!.finding += ` (step ${decisions - 1}, answer ${w.join(',')})`;
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
      ...(dups ? [`- Duplicate option labels: ${dups} (shown as "label #2" in the prompt and the options column)`] : []),
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
  const effort = g('effort');
  if (effort !== undefined && !['low', 'medium', 'high'].includes(effort)) return bad();
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
    if (effort !== undefined) o.effort = effort as 'low';
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
  log('usage: node playtest.ts --adapter <module> [--seed s] [--difficulty d] [--scenario s] [--model claude-opus-5-5|claude-sonnet-5-5] [--max-usd 5] [--max-decisions n] [--effort low|medium|high] [--runs n] [--docs a.md,b.md] [--env .env.local] [--out dir] [--dummy] [--ledger spend.jsonl] [--total-cap usd] [--require-cap]');
  return 2;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
