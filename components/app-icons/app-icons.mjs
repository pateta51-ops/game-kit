import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';

const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const dataUrl = async (file) => `data:${extname(file).toLowerCase() === '.svg' ? 'image/svg+xml' : 'image/png'};base64,${(await readFile(file)).toString('base64')}`;

export function headTags({ shortName, name, background, path = 'app-icons', manifestRoot = false }) {
  return `<link rel="manifest" href="${manifestRoot ? '' : `${escape(path)}/`}manifest.webmanifest">\n<link rel="apple-touch-icon" sizes="180x180" href="${escape(path)}/icon-180.png">\n<meta name="theme-color" content="${escape(background)}">\n<meta name="apple-mobile-web-app-title" content="${escape(shortName ?? name)}">`;
}

export function insertHead(html, tags) {
  if (!/<\/head\s*>/i.test(html)) throw new Error('index.html needs a closing head tag');
  const attr = (tag, key) => new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((v) => v !== undefined)?.toLowerCase();
  return html.replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/i, (head) => head.replace(/[ \t]*<(link|meta)\b[^>]*>\r?\n?/gi, (tag, type) => {
    const value = attr(tag, type.toLowerCase() === 'link' ? 'rel' : 'name');
    return ['manifest', 'apple-touch-icon', 'theme-color', 'apple-mobile-web-app-title'].includes(value) ? '' : tag;
  }).replace(/\s*<\/head\s*>/i, `\n${tags}\n</head>`));
}

export async function buildIcons({ mark, out, name, shortName = name, background, backgroundImage, width = 0.8, x = 0, y = 0, html, path = 'app-icons', manifestRoot = false }) {
  if (!name || !background || !mark || !out) throw new Error('mark, out, name and background are required');
  if (![width, x, y].every(Number.isFinite) || width <= 0 || width > 1 || Math.hypot(x, y) >= 0.4) throw new Error('width must be in (0,1]; nudge must be inside the safe circle');
  path = String(path).replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (!/^(?!\/|[a-z]+:)[\w./-]+$/i.test(path) || path.split('/').some((part) => /^\.{0,2}$/.test(part))) throw new Error('path must be a relative folder without . or .. segments');
  const image = await dataUrl(mark);
  const backdrop = backgroundImage ? await dataUrl(backgroundImage) : null;
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
    await page.setContent('<canvas></canvas>');
    if (!(await page.evaluate((c) => globalThis.CSS.supports('color', c), background))) throw new Error('Invalid background colour');
    await mkdir(out, { recursive: true });
    for (const [file, size, maskable] of [['icon-180.png', 180, false], ['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-512-maskable.png', 512, true]]) {
      const png = await page.evaluate(async ({ image, backdrop, background, size, width, x, y, maskable }) => {
        const load = async (src) => { const img = new globalThis.Image(); img.src = src; await img.decode(); return img; };
        const canvas = globalThis.document.querySelector('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = background; ctx.fillRect(0, 0, size, size);
        if (backdrop) {
          const bg = await load(backdrop);
          const scale = Math.max(size / bg.width, size / bg.height);
          ctx.drawImage(bg, (size - bg.width * scale) / 2, (size - bg.height * scale) / 2, bg.width * scale, bg.height * scale);
        }
        const img = await load(image);
        const ratio = img.height / img.width;
        if (!(ratio > 0 && Number.isFinite(ratio))) throw new Error('mark needs an intrinsic width and height');
        const share = Math.min(width, 1 / ratio, maskable ? 2 * (0.4 - Math.hypot(x, y)) / Math.hypot(1, ratio) : 1 - 2 * Math.abs(x), (1 - 2 * Math.abs(y)) / ratio);
        const w = size * share, h = w * ratio;
        ctx.drawImage(img, size * (0.5 + x) - w / 2, size * (0.5 + y) - h / 2, w, h);
        return canvas.toDataURL('image/png').split(',')[1];
      }, { image, backdrop, background, size, width, x, y, maskable });
      await writeFile(join(out, file), Buffer.from(png, 'base64'));
    }
  } finally { await browser.close(); }
  const icons = [180, 192, 512].map((n) => ({ src: `icon-${n}.png`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'any' }));
  icons.push({ src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' });
  const up = posix.relative(path, '.');
  if (manifestRoot) for (const icon of icons) icon.src = `${path}/${icon.src}`;
  const base = manifestRoot ? './' : `${up}/`;
  await writeFile(join(out, manifestRoot ? up : '.', 'manifest.webmanifest'), JSON.stringify({ name, short_name: shortName, start_url: base, scope: base, display: 'standalone', background_color: background, theme_color: background, icons }, null, 2) + '\n');
  const tags = headTags({ name, shortName, background, path, manifestRoot });
  if (html) await writeFile(html, insertHead(await readFile(html, 'utf8'), tags));
  return tags;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const neg = (a) => /^-[\d.]/.test(a ?? '');
    const raw = process.argv.slice(2);
    const args = raw.flatMap((a, i) => (neg(a) && /^--[^=]+$/.test(raw[i - 1] ?? '') ? [] : /^--[^=]+$/.test(a) && neg(raw[i + 1]) ? [`${a}=${raw[i + 1]}`] : [a]));
    const { values } = parseArgs({ args, options: { ...Object.fromEntries(['mark', 'out', 'name', 'short-name', 'background', 'background-image', 'width', 'x', 'y', 'html', 'path'].map((key) => [key, { type: 'string' }])), 'manifest-root': { type: 'boolean' } } });
    console.log(await buildIcons({ ...values, manifestRoot: values['manifest-root'], shortName: values['short-name'], backgroundImage: values['background-image'], width: Number(values.width ?? 0.8), x: Number(values.x ?? 0), y: Number(values.y ?? 0) }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
