// Screenshots the static mock pages of a list with Playwright and writes a defect report per mock: page errors, failed
// requests, broken images, fonts in use, bytes. --only re-runs the named ones and keeps the rest of the report.
// Exit codes: 0 clean, 1 a mock has errors, failed requests or broken images, 2 usage or a failed read.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { flags, isMain, stdio, type Io } from './args.ts';

export interface Mock {
  name: string;
  /** The page, relative to --src. */
  file: string;
  query?: string;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  /** chromium (default), webkit or firefox. */
  browser?: string;
  fullPage?: boolean;
}
export interface MockReport {
  errors: string[];
  failed: string[];
  broken: string[];
  fonts: string[];
  bytes: number;
}
interface Ev {
  message: string;
  type(): string;
  text(): string;
  url(): string;
}
interface Page {
  on(event: string, fn: (e: Ev) => void): unknown;
  goto(url: string): Promise<unknown>;
  waitForLoadState(state: 'load'): Promise<unknown>;
  waitForTimeout(ms: number): Promise<unknown>;
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
  screenshot(o: { path: string; fullPage: boolean }): Promise<unknown>;
}
interface Browser {
  newContext(o: object): Promise<{ newPage(): Promise<Page>; close(): Promise<unknown> }>;
  close(): Promise<unknown>;
}
export type Playwright = Record<string, { launch(): Promise<Browser> } | undefined>;
export interface CaptureOptions {
  src: string;
  out: string;
  only: readonly string[] | undefined;
  width: number;
  height: number;
  settleMs: number;
}

export async function capture(list: readonly Mock[], o: CaptureOptions, pw: Playwright, io: Io): Promise<Record<string, MockReport>> {
  const reportPath = join(o.out, 'capture-report.json');
  const report = o.only !== undefined && existsSync(reportPath) ? (JSON.parse(readFileSync(reportPath, 'utf8')) as Record<string, MockReport>) : {};
  const launched: Record<string, Browser> = {};
  try {
    for (const m of list) {
      if (o.only !== undefined && !o.only.includes(m.name)) continue;
      const kind = m.browser ?? 'chromium';
      const type = pw[kind];
      if (type === undefined) throw new Error(`${m.name}: no browser ${kind}`);
      const browser = (launched[kind] ??= await type.launch());
      const ctx = await browser.newContext({ viewport: { width: m.width ?? o.width, height: m.height ?? o.height }, ...(m.deviceScaleFactor ? { deviceScaleFactor: m.deviceScaleFactor } : {}) });
      const page = await ctx.newPage();
      const errors: string[] = [];
      const failed: string[] = [];
      page.on('pageerror', (e) => void errors.push(e.message));
      page.on('console', (c) => void (c.type() === 'error' && errors.push(c.text())));
      page.on('requestfailed', (r) => void failed.push(r.url()));
      await page.goto(pathToFileURL(join(o.src, m.file)).href + (m.query ?? ''));
      await page.waitForLoadState('load');
      await page.evaluate(() => document.fonts.ready.then(() => null));
      await page.waitForTimeout(o.settleMs);
      const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
      const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
      const file = join(o.out, `${m.name}.png`);
      mkdirSync(dirname(file), { recursive: true });
      await page.screenshot({ path: file, fullPage: Boolean(m.fullPage) });
      const bytes = statSync(file).size;
      report[m.name] = { errors, failed, broken, fonts: [...new Set(fonts)], bytes };
      io.out(`${m.name}: ${String(bytes)} bytes${errors.length + failed.length + broken.length > 0 ? ' PROBLEMS' : ''}`);
      await ctx.close();
    }
  } finally {
    for (const b of Object.values(launched)) await b.close();
  }
  mkdirSync(o.out, { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 1) + '\n');
  return report;
}

const USAGE =
  'usage: node mock-capture.ts --list <json array of { name, file, ... }> --src <dir> --out <dir> [--only a,b] [--width 3840] [--height 2160] [--settle-ms 800] [--playwright <module>] [--config <json>]';

export async function run(args: readonly string[], io: Io = stdio, pw?: Playwright): Promise<number> {
  try {
    const f = flags(args, ['list', 'src', 'out', 'only', 'width', 'height', 'settle-ms', 'playwright']);
    const [list, src, out] = ['list', 'src', 'out'].map((k) => f?.[k]?.[0]);
    const width = f?.['width']?.[0] ?? '3840';
    const height = f?.['height']?.[0] ?? '2160';
    const settle = f?.['settle-ms']?.[0] ?? '800';
    if (f === null || list === undefined || src === undefined || out === undefined || [width, height, settle].some((v) => !/^\d+$/.test(v))) {
      io.err(USAGE);
      return 2;
    }
    const mocks = JSON.parse(readFileSync(resolve(list), 'utf8')) as Mock[];
    const lib = pw ?? ((await import(f['playwright']?.[0] ?? 'playwright')) as Playwright);
    const report = await capture(mocks, { src: resolve(src), out: resolve(out), only: f['only']?.flatMap((v) => v.split(',')), width: Number(width), height: Number(height), settleMs: Number(settle) }, lib, io);
    return Object.values(report).some((r) => r.errors.length + r.failed.length + r.broken.length > 0) ? 1 : 0;
  } catch (error) {
    io.err(`mock-capture: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
