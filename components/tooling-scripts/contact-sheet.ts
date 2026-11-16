// Lays the screenshots of a folder out as one contact sheet PNG (a grid of thumbnails, each under its file name) so a
// run's pictures can be looked at once. Uses Playwright's chromium (the game's own package, or `--playwright`).
// Exit codes: 0 done, 1 no picture found, 2 usage or a failed read or write.
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { flags, isMain, stdio, type Io } from './args';

export interface Sheet {
  goto(url: string): Promise<unknown>;
  screenshot(o: { path: string; fullPage: boolean }): Promise<unknown>;
}
export interface Lib {
  chromium: { launch(): Promise<{ newPage(o: object): Promise<Sheet>; close(): Promise<unknown> }> };
}

export const pictures = (dir: string, match: RegExp): string[] => readdirSync(dir).filter((n) => /\.(png|jpe?g|webp)$/i.test(n) && match.test(n)).sort();
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${String(c.charCodeAt(0))};`);

export function sheetHtml(dir: string, names: readonly string[], cols: number, thumb: number): string {
  const cells = names.map((n) => `<figure><img src="${esc(pathToFileURL(join(dir, n)).href)}"><figcaption>${esc(n)}</figcaption></figure>`).join('');
  return `<html><body style="margin:0;padding:8px;background:#222;color:#ddd;font:12px sans-serif"><div style="display:grid;grid-template-columns:repeat(${String(cols)},${String(thumb)}px);gap:8px">${cells}</div><style>figure{margin:0}img{width:${String(thumb)}px;display:block;background:#444}</style></body></html>`;
}

const USAGE = 'usage: tsx contact-sheet.ts --dir <dir> --out <sheet.png> [--cols 4] [--thumb 480] [--match <regex>] [--playwright <module>] [--config <json>]';

export async function run(args: readonly string[], io: Io = stdio, lib?: Lib): Promise<number> {
  try {
    const f = flags(args, ['dir', 'out', 'cols', 'thumb', 'match', 'playwright']);
    const dir = f?.['dir']?.[0];
    const out = f?.['out']?.[0];
    const cols = Number(f?.['cols']?.[0] ?? '4');
    const thumb = Number(f?.['thumb']?.[0] ?? '480');
    if (f === null || dir === undefined || out === undefined || !Number.isInteger(cols) || cols < 1 || !Number.isInteger(thumb) || thumb < 16) {
      io.err(USAGE);
      return 2;
    }
    const names = pictures(resolve(dir), new RegExp(f['match']?.[0] ?? '')).filter((n) => resolve(dir, n) !== resolve(out));
    if (names.length === 0) {
      io.err(`error: no pictures in ${dir}`);
      return 1;
    }
    const tmp = mkdtempSync(join(tmpdir(), 'contact-sheet-'));
    try {
      const html = join(tmp, 'sheet.html');
      writeFileSync(html, sheetHtml(resolve(dir), names, cols, thumb));
      const pw = lib ?? ((await import(f['playwright']?.[0] ?? 'playwright')) as Lib);
      const browser = await pw.chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width: cols * (thumb + 8) + 8, height: 600 } });
        await page.goto(pathToFileURL(html).href);
        await page.screenshot({ path: resolve(out), fullPage: true });
      } finally {
        await browser.close();
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    io.out(`${out}: ${String(names.length)} pictures`);
    return 0;
  } catch (error) {
    io.err(`contact-sheet: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
