import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { run as sheet, sheetHtml, type Lib as SheetLib } from './contact-sheet.ts';
import { iconHtml, run as icons, type Lib } from './home-screen.ts';

const dir = mkdtempSync(join(tmpdir(), 'shots-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const lines: string[] = [];
const io = { out: (l: string) => void lines.push(l), err: (l: string) => void lines.push(l) };

describe('home-screen', () => {
  it('pads, sizes and backs the logo; one png per size', async () => {
    expect(iconHtml('<svg viewBox="0 0 1 1"/>', 200, '#112233', 10)).toContain('background:#112233;width:200px');
    expect(iconHtml('<svg/>', 200, 'red', 10)).toContain('width:160px');
    writeFileSync(join(dir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const shots: string[] = [];
    const lib: Lib = {
      chromium: {
        launch: () =>
          Promise.resolve({
            close: () => Promise.resolve(),
            newPage: () => Promise.resolve({ setContent: () => Promise.resolve(), screenshot: (o: { path: string }) => Promise.resolve(void shots.push(o.path.replace(/^.*[\\/]/, ''))) }),
          }),
      },
    };
    expect(await icons(['--svg', join(dir, 'logo.svg'), '--out', join(dir, 'o'), '--sizes', '32,64'], io, lib)).toBe(0);
    expect(shots).toEqual(['icon-32.png', 'icon-64.png']);
    expect(await icons(['--svg', join(dir, 'logo.svg')], io, lib)).toBe(2);
    writeFileSync(join(dir, 'bad.svg'), 'x');
    expect(await icons(['--svg', join(dir, 'bad.svg'), '--out', join(dir, 'o')], io, lib)).toBe(2);
  });
});

describe('contact-sheet', () => {
  it('names each picture under its thumbnail and skips the sheet itself', async () => {
    mkdirSync(join(dir, 's'));
    for (const n of ['b.png', 'a.png', 'notes.txt', 'sheet.png']) writeFileSync(join(dir, 's', n), '');
    expect(sheetHtml(dir, ['a.png'], 2, 100)).toContain('<figcaption>a.png</figcaption>');
    let url = '';
    const lib: SheetLib = {
      chromium: {
        launch: () =>
          Promise.resolve({
            close: () => Promise.resolve(),
            newPage: () => Promise.resolve({ goto: (u: string) => Promise.resolve(void (url = u)), screenshot: () => Promise.resolve() }),
          }),
      },
    };
    expect(await sheet(['--dir', join(dir, 's'), '--out', join(dir, 's', 'sheet.png')], io, lib)).toBe(0);
    expect(lines.at(-1)).toContain('2 pictures');
    expect(url).toContain('sheet.html');
    expect(await sheet(['--dir', join(dir, 's'), '--out', join(dir, 'x.png'), '--match', 'zzz'], io, lib)).toBe(1);
  });
});
