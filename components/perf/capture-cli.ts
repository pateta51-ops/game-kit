// node components/perf/capture-cli.ts --config perf-capture.json [--out perf-result.json]   (Playwright: run it in WSL or CI, not in unit tests)
// config: { url, ready?, counters?, dispatch?, actions?, runs?, viewport?, cpuThrottle?, readyTimeoutMs? }
// Several runs: load timing is the per-metric median; counters and dispatch come from the last run.
import { readFileSync, writeFileSync } from 'node:fs';
import { capture, type CaptureOptions, type LoadRun, type PerfCapture, type PerfPage } from './capture.ts';

export interface CaptureConfig extends CaptureOptions {
  runs?: number;
  viewport?: { width: number; height: number };
  /** CPU slowdown factor (4 = phone-like). */
  cpuThrottle?: number;
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] as number;

export async function runCapture(cfg: CaptureConfig, newPage: () => Promise<{ page: PerfPage; close: () => Promise<void> }>): Promise<PerfCapture> {
  const runs: PerfCapture[] = [];
  for (let i = 0; i < (cfg.runs ?? 3); i++) {
    const { page, close } = await newPage();
    try {
      runs.push(await capture(page, cfg));
    } finally {
      await close();
    }
  }
  const last = runs[runs.length - 1] as PerfCapture;
  const load = Object.fromEntries(Object.keys(last.load).map((k) => [k, median(runs.map((r) => r.load[k as keyof LoadRun]))])) as unknown as LoadRun;
  return { ...last, load };
}

export function flag(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
}

interface Launcher {
  chromium: { launch: () => Promise<{ newContext: (o: unknown) => Promise<{ newPage: () => Promise<PerfPage>; newCDPSession: (p: unknown) => Promise<{ send: (m: string, a: unknown) => Promise<unknown> }>; close: () => Promise<void> }>; close: () => Promise<void> }> };
}

async function main(args: string[]): Promise<number> {
  const get = (f: string) => flag(args, f);
  const cfgPath = get('--config');
  if (!cfgPath) {
    console.error('usage: capture-cli.ts --config <file.json> [--out <file.json>]');
    return 2;
  }
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as CaptureConfig;
  const pw = (await import(['playwright'].join(''))) as Launcher;
  const browser = await pw.chromium.launch();
  try {
    const result = await runCapture(cfg, async () => {
      const ctx = await browser.newContext({ viewport: cfg.viewport ?? { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      if (cfg.cpuThrottle) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cfg.cpuThrottle });
      return { page, close: () => ctx.close() };
    });
    const text = `${JSON.stringify(result, null, 2)}\n`;
    const out = get('--out');
    if (out) writeFileSync(out, text);
    else console.log(text);
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('capture-cli.ts')) process.exitCode = await main(process.argv.slice(2));
