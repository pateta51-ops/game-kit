// Renders a logo SVG as the PNG icons of a home screen (apple-touch, manifest sizes) with Playwright's chromium.
// The logo is centred on a square of `--background` (transparent by default), `--padding` percent of the side kept
// free on every edge (use 10 for maskable icons). Writes `<out>/<prefix><size>.png`. Playwright is the game's own
// package (or the one `--playwright` names). Exit codes: 0 done, 2 usage or a failed read or write.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';

export interface Shot {
  setContent(html: string): Promise<unknown>;
  screenshot(o: { path: string; omitBackground: boolean }): Promise<unknown>;
}
export interface Lib {
  chromium: { launch(): Promise<{ newPage(o: object): Promise<Shot>; close(): Promise<unknown> }> };
}

export function iconHtml(svg: string, size: number, background: string, padding: number): string {
  const inner = Math.round((size * (100 - 2 * padding)) / 100);
  return `<html><body style="margin:0;background:${background};width:${String(size)}px;height:${String(size)}px;display:flex;align-items:center;justify-content:center"><div style="width:${String(inner)}px;height:${String(inner)}px;display:flex">${svg.replace(/<svg\b/, '<svg style="width:100%;height:100%"')}</div></body></html>`;
}

const USAGE = 'usage: tsx home-screen.ts --svg <file> --out <dir> [--sizes 180,192,512] [--background transparent] [--padding 0] [--prefix icon-] [--playwright <module>] [--config <json>]';

export async function run(args: readonly string[], io: Io = stdio, lib?: Lib): Promise<number> {
  try {
    const f = flags(args, ['svg', 'out', 'sizes', 'background', 'padding', 'prefix', 'playwright']);
    const svg = f?.['svg']?.[0];
    const out = f?.['out']?.[0];
    const sizes = (f?.['sizes']?.[0] ?? '180,192,512').split(',').map(Number);
    const padding = Number(f?.['padding']?.[0] ?? '0');
    if (f === null || svg === undefined || out === undefined || sizes.some((s) => !Number.isInteger(s) || s < 1) || !(padding >= 0 && padding < 50)) {
      io.err(USAGE);
      return 2;
    }
    const text = readFileSync(resolve(svg), 'utf8');
    if (!/<svg\b/.test(text)) {
      io.err(`error: ${svg} has no <svg> element`);
      return 2;
    }
    mkdirSync(resolve(out), { recursive: true });
    const pw = lib ?? ((await import(f['playwright']?.[0] ?? 'playwright')) as Lib);
    const browser = await pw.chromium.launch();
    try {
      for (const s of sizes) {
        const page = await browser.newPage({ viewport: { width: s, height: s } });
        await page.setContent(iconHtml(text, s, f['background']?.[0] ?? 'transparent', padding));
        const file = join(resolve(out), `${f['prefix']?.[0] ?? 'icon-'}${String(s)}.png`);
        await page.screenshot({ path: file, omitBackground: true });
        io.out(file);
      }
    } finally {
      await browser.close();
    }
    return 0;
  } catch (error) {
    io.err(`home-screen: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
