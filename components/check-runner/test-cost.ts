// Test-cost budget (from middle-earth-player, MIT): a whole game is played once, in its golden test; the test files that still
// play whole games are listed with their call count and the list may not grow. A listed file that plays fewer (or none) is stale.
//
//   node test-cost.ts [--config path]
//
// Config (test-cost.config.json): { "roots": ["src", "test"], "testSuffix": ".test.ts", "skip": ["golden.test.ts"],
// "players": ["playOut"], "playerFiles": ["test/scenarios/*/game.ts"], "playerPattern": "^export (?:async )?(?:function|const) (play[A-Z]\\w*)\\b",
// "allow": { "src/a.test.ts": 2 } }. `playerFiles` (a `*` is one folder) add the names their `playerPattern` (flags gm) finds.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface TestCostConfig {
  roots?: string[];
  testSuffix?: string;
  skip?: string[];
  players: string[];
  playerFiles?: string[];
  playerPattern?: string;
  allow?: Record<string, number>;
}

/** The calls of known players in a source, a player imported under another name (`playA as playB`) included. */
export function wholeGames(source: string, known: ReadonlySet<string>): number {
  const names = new Set(known);
  for (const m of source.matchAll(/\b(\w+) as (\w+)\b/g)) if (known.has(m[1] ?? '')) names.add(m[2] ?? '');
  let count = 0;
  for (const n of names) count += source.match(new RegExp(`(?<![\\w.])${n}\\(`, 'g'))?.length ?? 0;
  return count;
}

const walk = (root: string, dir: string): string[] =>
  readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.name === 'node_modules' || e.name.startsWith('.') ? [] : e.isDirectory() ? walk(root, `${dir}/${e.name}`) : [`${dir}/${e.name}`]);

/** Problems found: a file over its listed count, a listed count that is no longer exact. Empty when the budget holds. */
export function testCost(cfg: TestCostConfig, root: string): string[] {
  const all = (cfg.roots ?? ['src', 'test']).flatMap((r) => { try { return walk(root, r); } catch { return []; } });
  const read = (f: string): string => readFileSync(path.join(root, f), 'utf8');
  const players = new Set(cfg.players);
  const pat = new RegExp(cfg.playerPattern ?? '^export (?:async )?(?:function|const) (play[A-Z]\\w*)\\b', 'gm');
  for (const g of cfg.playerFiles ?? []) {
    const re = new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+')}$`);
    for (const f of all.filter((x) => re.test(x))) for (const m of read(f).matchAll(pat)) players.add(m[1] ?? '');
  }
  const suffix = cfg.testSuffix ?? '.test.ts';
  const skip = cfg.skip ?? [];
  const plays = new Map(all.filter((f) => f.endsWith(suffix) && !skip.some((s) => f.endsWith(s))).map((f) => [f, wholeGames(read(f), players)]));
  const allow = cfg.allow ?? {};
  const out: string[] = [];
  for (const [f, n] of plays) if (n > (allow[f] ?? 0)) out.push(`${f}: ${n} whole games played, at most ${allow[f] ?? 0} (read a golden's state, or build the table directly)`);
  for (const [f, n] of Object.entries(allow)) if ((plays.get(f) ?? 0) < n) out.push(`${f}: ${plays.get(f) ?? 0}, listed at ${n}: lower or remove the entry`);
  return out;
}

export function main(argv: readonly string[]): void {
  const at = argv.indexOf('--config');
  const cfg = JSON.parse(readFileSync(at >= 0 ? (argv[at + 1] ?? '') : 'test-cost.config.json', 'utf8')) as TestCostConfig;
  const problems = testCost(cfg, process.cwd());
  if (problems.length) { console.error(`test-cost: ${problems.length} problem(s)\n${problems.join('\n')}`); process.exitCode = 1; } else console.log('test-cost: ok');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main(process.argv.slice(2));
