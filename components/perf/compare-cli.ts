// node components/perf/compare-cli.ts <before.json> <after.json> [--threshold 10] [--min-ms 1] [--limit path=pct]...
// Exit 0 no regression, 1 a regression, 2 bad usage.
import { readFileSync } from 'node:fs';
import { compare, formatComparison } from './capture.ts';

export function run(args: readonly string[], out: (s: string) => void = console.log): number {
  const files: string[] = [];
  const o: { thresholdPct?: number; minMs?: number; thresholds: Record<string, number> } = { thresholds: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--threshold') o.thresholdPct = Number(args[++i]);
    else if (a === '--min-ms') o.minMs = Number(args[++i]);
    else if (a === '--limit') {
      const m = /^(.+)=(\d+(?:\.\d+)?)$/.exec(args[++i] ?? '');
      if (!m) return 2;
      o.thresholds[m[1] as string] = Number(m[2]);
    } else files.push(a);
  }
  if (files.length !== 2 || [o.thresholdPct, o.minMs].some((n) => n !== undefined && Number.isNaN(n))) {
    out('usage: compare-cli.ts <before.json> <after.json> [--threshold pct] [--min-ms ms] [--limit path=pct]...');
    return 2;
  }
  const c = compare(JSON.parse(readFileSync(files[0] as string, 'utf8')), JSON.parse(readFileSync(files[1] as string, 'utf8')), o);
  out(formatComparison(c));
  return c.regressions.length ? 1 : 0;
}

if (process.argv[1]?.endsWith('compare-cli.ts')) process.exitCode = run(process.argv.slice(2));
