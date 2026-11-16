// Browser step for a game's e2e run: does the content fill the screen? `coverageProblems` is pure over boxes;
// `contentBoxes` runs in the page. Empty problems is clean.
import type { Box, LayoutPage } from './layout';
export interface CoverageSpec {
  area?: string;
  items?: string;
  minSpan?: number;
  maxEmpty?: number;
  cell?: number;
}
export interface Coverage {
  area: Box;
  boxes: Box[];
}

export function coverageProblems(c: Coverage, spec: CoverageSpec = {}): string[] {
  const { area: a, boxes } = c;
  const w = a.r - a.l;
  const h = a.b - a.t;
  const out: string[] = [];
  if (w <= 0 || h <= 0) return ['the area has no size'];
  if (!boxes.length) return ['no content in the area'];
  const minSpan = spec.minSpan ?? 0.7;
  const maxEmpty = spec.maxEmpty ?? 0.25;
  const sw = (Math.max(...boxes.map((b) => b.r)) - Math.min(...boxes.map((b) => b.l))) / w;
  const sh = (Math.max(...boxes.map((b) => b.b)) - Math.min(...boxes.map((b) => b.t))) / h;
  if (sw < minSpan) out.push(`content spans ${(sw * 100).toFixed(0)}% of the width (min ${(minSpan * 100).toFixed(0)}%)`);
  if (sh < minSpan) out.push(`content spans ${(sh * 100).toFixed(0)}% of the height (min ${(minSpan * 100).toFixed(0)}%)`);
  const cell = spec.cell ?? 16;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const full = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  for (const b of boxes)
    for (let y = Math.max(0, Math.floor((b.t - a.t) / cell)); y < Math.min(rows, Math.ceil((b.b - a.t) / cell)); y++)
      for (let x = Math.max(0, Math.floor((b.l - a.l) / cell)); x < Math.min(cols, Math.ceil((b.r - a.l) / cell)); x++)
        (full[y] as boolean[])[x] = true;
  const hist = new Array<number>(cols).fill(0);
  let best = { n: 0, x: 0, y: 0, cw: 0, ch: 0 };
  for (let y = 0; y < rows; y++) {
    const row = full[y] as boolean[];
    for (let x = 0; x < cols; x++) hist[x] = row[x] ? 0 : (hist[x] ?? 0) + 1;
    for (let x = 0; x < cols; x++) {
      let m = Infinity;
      for (let k = x; k < cols && (hist[k] ?? 0) > 0; k++) {
        m = Math.min(m, hist[k] ?? 0);
        const n = (k - x + 1) * m;
        if (n > best.n) best = { n, x, y: y - m + 1, cw: k - x + 1, ch: m };
      }
    }
  }
  const frac = (best.cw * cell * best.ch * cell) / (w * h);
  if (frac > maxEmpty)
    out.push(
      `empty block ${String(best.cw * cell)}x${String(best.ch * cell)}px at ${String(Math.round(a.l + best.x * cell))},${String(Math.round(a.t + best.y * cell))} is ${(frac * 100).toFixed(0)}% of the area (max ${(maxEmpty * 100).toFixed(0)}%)`,
    );
  return out;
}

export function contentBoxes(spec: CoverageSpec): Coverage {
  const box = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  };
  const shown = (el: Element) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.right > r.left && r.bottom > r.top;
  };
  const root = spec.area ? document.querySelector(spec.area) : null;
  const area = spec.area && !root ? { l: 0, t: 0, r: 0, b: 0 } : root ? box(root) : { l: 0, t: 0, r: window.innerWidth, b: window.innerHeight };
  const boxes = [...(root ?? document.body).querySelectorAll(spec.items ?? '*')]
    .filter(shown)
    .filter((el) => {
      if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) return false;
      const media = /^(IMG|SVG|CANVAS|VIDEO|INPUT|SELECT|TEXTAREA)$/i.test(el.tagName);
      const text = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      return spec.items !== undefined || media || text;
    })
    .map(box);
  return { area, boxes };
}

export async function coverageFindings(page: LayoutPage, spec: CoverageSpec = {}): Promise<{ items: number; problems: string[] }> {
  const c = await page.evaluate(contentBoxes, spec);
  return { items: c.boxes.length, problems: coverageProblems(c, spec) };
}
