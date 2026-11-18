// Renders card faces that exist only as print-and-play PDF pages: one page (or a region of it) becomes one picture.
// Pure JavaScript: the game's `pdfjs-dist` draws the page on `@napi-rs/canvas` (the game installs both; this script names neither
// in its imports). Config: { root, from?: "<base dir of the PDFs>", source: "<records name>", pdfjs?: "node_modules/pdfjs-dist", dpi?: 300,
//   format?: "png" | "jpeg", quality?: 92, faces: [{ id, pdf, page, name?, region?: {x,y,w,h in PDF points (1/72 in)} }] }.
// A region (or png) gives PNG; "jpeg" is only for a whole page. Writes `<root>/<source>/<name>.<ext>` and `<root>/<source>.json`
// (id -> { file, from, page }). Exit 0, 2 usage or a failed render.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain, stdio, type Io } from '../tooling-scripts/args.ts';
import { codec, fail, load, posix, safeName, type Box, type Records } from './lib.ts';

export interface Face {
  id: string;
  pdf: string;
  page: number;
  name?: string;
  region?: Box;
}
export type Render = (pdf: string, page: number, o: { dpi: number; format: 'png' | 'jpeg'; quality: number; region?: Box }) => Promise<Uint8Array>;

interface Canvas {
  toBuffer(mime: string, quality?: number): Buffer;
}
interface Pdfjs {
  getDocument(o: object): { promise: Promise<{ getPage(n: number): Promise<{ getViewport(o: { scale: number }): { width: number; height: number }; render(o: object): { promise: Promise<void> } }>; canvasFactory: { create(w: number, h: number): { canvas: Canvas; context: unknown } } }>; destroy(): Promise<void> };
}

/** The renderer on the game's pdf.js folder. */
export const pdfjsRender = (pdfjsDir: string): Render => async (pdf, pageNumber, o) => {
  const url = (sub: string): string => pathToFileURL(join(pdfjsDir, sub) + '/').href;
  const lib = (await import(pathToFileURL(join(pdfjsDir, 'legacy/build/pdf.mjs')).href)) as Pdfjs;
  const task = lib.getDocument({ data: new Uint8Array(readFileSync(pdf)), standardFontDataUrl: url('standard_fonts'), cMapUrl: url('cmaps'), iccUrl: url('iccs'), wasmUrl: url('wasm'), verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: o.dpi / 72 });
    const { canvas, context } = doc.canvasFactory.create(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const whole = o.format === 'jpeg' ? canvas.toBuffer('image/jpeg', o.quality) : canvas.toBuffer('image/png');
    if (!o.region) return whole;
    const k = o.dpi / 72;
    const r = o.region;
    return (await codec()).out(whole, 'png', { x: Math.round(r.x * k), y: Math.round(r.y * k), w: Math.round(r.w * k), h: Math.round(r.h * k) });
  } finally {
    await task.destroy();
  }
};

const USAGE = 'usage: node art-render-pdf.ts --config <json>';

export async function run(args: readonly string[], io: Io = stdio, render?: Render): Promise<number> {
  try {
    const l = load(args);
    if (l === null) {
      io.err(USAGE);
      return 2;
    }
    const c = l.config as { root: string; from?: string; source: string; pdfjs?: string; dpi?: number; format?: 'png' | 'jpeg'; quality?: number; faces: Face[] };
    const [root, base] = [resolve(l.dir, c.root), resolve(l.dir, c.from ?? '.')];
    const draw = render ?? pdfjsRender(resolve(l.dir, c.pdfjs ?? 'node_modules/pdfjs-dist'));
    const format = c.format ?? 'png';
    mkdirSync(join(root, c.source), { recursive: true });
    const records: Records = {};
    for (const f of c.faces) {
      if (f.region && format === 'jpeg') throw new Error(`${f.id}: a region is written as png, not jpeg`);
      const rel = posix(join(c.source, `${f.name ?? safeName(f.id)}.${format === 'jpeg' ? 'jpg' : 'png'}`));
      const bytes = await draw(resolve(base, f.pdf), f.page, { dpi: c.dpi ?? 300, format, quality: c.quality ?? 92, ...(f.region ? { region: f.region } : {}) });
      writeFileSync(join(root, `${rel}.tmp`), bytes);
      renameSync(join(root, `${rel}.tmp`), join(root, rel));
      records[f.id] = { file: rel, from: f.pdf, page: f.page };
    }
    writeFileSync(join(root, `${c.source}.json`), JSON.stringify(records, null, 2) + '\n');
    io.out(`art-render-pdf: ${String(c.faces.length)} faces`);
    return 0;
  } catch (e) {
    return fail(io, 'art-render-pdf', e);
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
