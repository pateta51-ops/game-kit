// Browser steps for a game's e2e run: layout bounds. `measure` and `topAt` run in the page (self-contained, rectangles
// only); `layoutProblems` is pure. `page` is a Playwright Page (evaluate). Empty problems is clean.
export interface LayoutPage {
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
}
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
export interface Named {
  name: string;
  box: Box;
}
export interface MeasuredRow extends Named {
  scrollW: number;
  scrollH: number;
  clientW: number;
  clientH: number;
  within: Box | null;
}
export interface Measured {
  zones: (Named & { pieces: Named[]; overlapOk?: boolean })[];
  rows: MeasuredRow[];
}
export interface LayoutSpec {
  zones: string;
  pieces: string;
  parts?: string;
  rows?: string;
  rowBox?: string;
  overlapOk?: string;
  tolerance?: number;
}

export const outside = (b: Box, z: Box, tol = 0.5): string =>
  [
    b.l < z.l - tol ? `left by ${(z.l - b.l).toFixed(1)}px` : '',
    b.t < z.t - tol ? `top by ${(z.t - b.t).toFixed(1)}px` : '',
    b.r > z.r + tol ? `right by ${(b.r - z.r).toFixed(1)}px` : '',
    b.b > z.b + tol ? `bottom by ${(b.b - z.b).toFixed(1)}px` : '',
  ]
    .filter(Boolean)
    .join(', ');

export const overlap = (a: Box, b: Box, tol = 0.5): string => {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > tol && h > tol ? `${w.toFixed(1)}x${h.toFixed(1)}px` : '';
};

export function layoutProblems(m: Measured, tol = 0.5): string[] {
  const out: string[] = [];
  const all = m.zones.flatMap((z, zi) => z.pieces.map((p) => ({ ...p, zone: z.name, zi, fan: z.overlapOk === true })));
  for (const z of m.zones)
    for (const p of z.pieces) {
      const o = outside(p.box, z.box, tol);
      if (o) out.push(`${z.name}: ${p.name} crosses the zone's border: ${o}`);
    }
  all.forEach((a, i) => {
    for (const b of all.slice(i + 1)) {
      const o = a.fan && a.zi === b.zi ? '' : overlap(a.box, b.box, tol);
      if (o) out.push(`${a.zone}: ${a.name} overlaps ${b.name} (${b.zone}) by ${o}`);
    }
  });
  const st = Math.max(tol, 1);
  for (const r of m.rows) {
    const cut = Math.max(r.scrollH - r.clientH, r.scrollW - r.clientW);
    if (cut > st) out.push(`${r.name}: is cut by ${String(cut)}px`);
    const o = r.within ? outside(r.box, r.within, st) : '';
    if (o) out.push(`${r.name}: runs past its box: ${o}`);
  }
  return out;
}

export function measure(spec: LayoutSpec): Measured {
  const box = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  };
  const name = (el: Element) =>
    el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? el.getAttribute('class') ?? el.tagName.toLowerCase();
  const shown = (el: Element) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && (r.right > r.left || r.bottom > r.top);
  };
  const zones = [...document.querySelectorAll(spec.zones)].filter(shown).map((z) => ({
    name: name(z),
    box: box(z),
    overlapOk: spec.overlapOk !== undefined && z.matches(spec.overlapOk),
    pieces: [...z.querySelectorAll(spec.pieces)]
      .filter((p) => {
        const up = p.parentElement?.closest(spec.pieces);
        return shown(p) && p.closest(spec.zones) === z && (!up || !z.contains(up) || up === z);
      })
      .map((p) => {
        const b = box(p);
        for (const q of spec.parts ? [...p.querySelectorAll(spec.parts)].filter(shown) : []) {
          const c = box(q);
          b.l = Math.min(b.l, c.l);
          b.t = Math.min(b.t, c.t);
          b.r = Math.max(b.r, c.r);
          b.b = Math.max(b.b, c.b);
        }
        return { name: name(p), box: b };
      }),
  }));
  const rows = spec.rows
    ? [...document.querySelectorAll(spec.rows)].filter(shown).map((r, i) => {
        const w = spec.rowBox ? r.parentElement?.closest(spec.rowBox) : null;
        return {
          name: `${name(r)} #${String(i + 1)}`,
          box: box(r),
          scrollW: r.scrollWidth,
          scrollH: r.scrollHeight,
          clientW: r.clientWidth,
          clientH: r.clientHeight,
          within: w ? box(w) : null,
        };
      })
    : [];
  return { zones, rows };
}

export async function layoutFindings(
  page: LayoutPage,
  spec: LayoutSpec,
): Promise<{ pieces: number; rows: number; problems: string[] }> {
  const m = await page.evaluate(measure, spec);
  return {
    pieces: m.zones.reduce((n, z) => n + z.pieces.length, 0),
    rows: m.rows.length,
    problems: layoutProblems(m, spec.tolerance),
  };
}

export function topAt([sa, sb]: readonly [string, string]): string {
  const ea = document.querySelector(sa);
  if (!ea) return 'none';
  ea.scrollIntoView({ block: 'center', inline: 'center' });
  const ra = ea.getBoundingClientRect();
  for (const eb of document.querySelectorAll(sb)) {
    const rb = eb.getBoundingClientRect();
    const x0 = Math.max(ra.left, rb.left);
    const x1 = Math.min(ra.right, rb.right);
    const y0 = Math.max(ra.top, rb.top);
    const y1 = Math.min(ra.bottom, rb.bottom);
    if (x0 >= x1 || y0 >= y1) continue;
    const x = (x0 + x1) / 2;
    const y = (y0 + y1) / 2;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return 'offscreen';
    const top = document.elementFromPoint(x, y);
    if (top && (eb.contains(top) || top.closest(sb) !== null)) return 'b';
    if (top && ea.contains(top)) return 'a';
    return `other:${top ? `${top.tagName.toLowerCase()}.${top.getAttribute('class') ?? ''}` : ''}`;
  }
  return 'none';
}

export const onTop = (page: LayoutPage, a: string, b: string): Promise<string> =>
  page.evaluate(topAt, [a, b] as const);
