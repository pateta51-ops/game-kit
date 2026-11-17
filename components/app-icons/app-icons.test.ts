import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { chromium } from 'playwright-core';
// @ts-expect-error Node CLI is native JavaScript.
import { buildIcons, headTags, insertHead } from './app-icons.mjs';

it('writes opaque icons, a base-relative manifest and idempotent HTML', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'app-icons-'));
  const mark = join(dir, 'mark.svg');
  const html = join(dir, 'index.html');
  await writeFile(mark, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red" fill-opacity=".5"/></svg>');
  await writeFile(html, '<head><link href="old" rel=manifest><meta content="old" name="theme-color"><title>Keep</title></head>');
  const browser = await chromium.launch(process.env['PW_CHROMIUM_PATH'] ? { executablePath: process.env['PW_CHROMIUM_PATH'] } : {});
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await buildIcons({ mark, out: dir, name: 'A & B', background: '#123456', html });
    const first = await readFile(html, 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const tags: string = headTags({ name: 'A & B', background: '#123456' });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    expect(insertHead(first, tags)).toBe(first);
    expect(first.match(/rel="manifest"/g)).toHaveLength(1);
    expect(first).toContain('<title>Keep</title>');
    expect(first).toContain('A &amp; B');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await buildIcons({ mark: join(dir, 'icon-180.png'), out: dir, name: 'A & B', background: '#123456', backgroundImage: mark, html });
    expect(await readFile(html, 'utf8')).toBe(first);
    const page = await browser.newPage();
    for (const [file, size] of [['icon-180.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['icon-512-maskable.png', 512]] as const) {
      const src = `data:image/png;base64,${(await readFile(join(dir, file))).toString('base64')}`;
      const result = await page.evaluate(async (src) => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = image.width;
        const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
        return { width: image.width, height: image.height, opaque: pixels.every((v, i) => i % 4 !== 3 || v === 255) };
      }, src);
      expect(result).toEqual({ width: size, height: size, opaque: true });
    }
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.webmanifest'), 'utf8')) as { start_url: string; icons: { src: string; purpose: string }[] };
    expect(new URL(manifest.start_url, 'https://example.test/base/app-icons/manifest.webmanifest').pathname).toBe('/base/');
    expect(manifest.icons).toHaveLength(4);
    expect(manifest.icons[3]?.purpose).toBe('maskable');
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
}, 30000);

it('keeps maskable corners plain, writes a root manifest, and fails early on bad input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'app-icons-'));
  const mark = join(dir, 'mark.svg');
  await writeFile(mark, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="#ff0000"/></svg>');
  const out = join(dir, 'public', 'app-icons');
  const browser = await chromium.launch(process.env['PW_CHROMIUM_PATH'] ? { executablePath: process.env['PW_CHROMIUM_PATH'] } : {});
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const tags: string = await buildIcons({ mark, out, name: 'Tall', background: '#000000', manifestRoot: true, path: './app-icons/' });
    expect(tags).toContain('href="manifest.webmanifest"');
    const manifest = JSON.parse(await readFile(join(dir, 'public', 'manifest.webmanifest'), 'utf8')) as { start_url: string; icons: { src: string }[] };
    expect(manifest.start_url).toBe('./');
    expect(manifest.icons.every((i) => i.src.startsWith('app-icons/icon-'))).toBe(true);
    const page = await browser.newPage();
    const src = `data:image/png;base64,${(await readFile(join(out, 'icon-512-maskable.png'))).toString('base64')}`;
    const outside = await page.evaluate(async (src) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      const px = ctx.getImageData(0, 0, 512, 512).data;
      let red = 0;
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) if (Math.hypot(x - 255.5, y - 255.5) > 0.41 * 512 && px[(y * 512 + x) * 4]! > 128) red++;
      return red;
    }, src);
    expect(outside).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await expect(buildIcons({ mark, out: join(dir, 'bad'), name: 'X', background: 'notacolour' })).rejects.toThrow('Invalid background colour');
    await expect(readFile(join(dir, 'bad', 'icon-180.png'))).rejects.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await expect(buildIcons({ mark: join(dir, 'missing.svg'), out: join(dir, 'm'), name: 'X', background: '#000' })).rejects.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await expect(buildIcons({ mark, out, name: 'X', background: '#000', path: '.' })).rejects.toThrow('path');
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
}, 30000);
