// K269: pure logic of the layout editor; editor.html carries a generated copy (build.mjs), checked by editor.test.ts.
export type Rect = [number, number, number, number];
export type Fan = 'row' | 'column' | 'stack' | 'grid';
export type Zone = { r: Rect; label?: string; cards?: number; fan?: Fan; locked?: boolean; hidden?: boolean; [k: string]: unknown };
export type Screen = { w: number; h: number; card: [number, number]; zones: Record<string, Zone>; [k: string]: unknown };
export type Doc = { screens: Record<string, Screen> };
export type Guide = { axis: 'x' | 'y'; at: number };
export type Warning = { id: string; kind: 'cards' | 'overlap' | 'outside'; text: string };

const FANS = ['row', 'column', 'stack', 'grid'];
const num = (v: unknown, d: number): number => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : d);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function normalizeZone(v: unknown): Zone | null {
  const o: Record<string, unknown> | null = Array.isArray(v) ? { r: v } : isObj(v) ? v : null;
  if (!o || !Array.isArray(o.r)) return null;
  const r = o.r as unknown[];
  const { r: _r, label: _l, cards: _c, fan: _f, locked: _k, hidden: _h, ...rest } = o;
  const z: Zone = { r: [num(r[0], 0), num(r[1], 0), num(r[2], 0), num(r[3], 0)], ...rest };
  if (typeof o.label === 'string' && o.label) z.label = o.label;
  if (o.cards !== undefined && num(o.cards, 0) > 0) z.cards = Math.round(num(o.cards, 0));
  if (typeof o.fan === 'string' && FANS.includes(o.fan)) z.fan = o.fan as Fan;
  if (o.locked === true) z.locked = true;
  if (o.hidden === true) z.hidden = true;
  return z;
}

function normalizeScreen(v: unknown): Screen {
  const o = isObj(v) ? v : {};
  const c = Array.isArray(o.card) ? (o.card as unknown[]) : [];
  const { w: _w, h: _h, card: _c, zones: _z, ...rest } = o;
  const s: Screen = { ...rest, w: num(o.w, 3840), h: num(o.h, 2160), card: [num(c[0], 180), num(c[1], 252)], zones: {} };
  if (isObj(o.zones)) for (const [k, z] of Object.entries(o.zones)) { const n = normalizeZone(z); if (n) s.zones[k] = n; }
  return s;
}

export function normalizeDoc(v: unknown): Doc {
  if (typeof v === 'string') v = JSON.parse(v);
  const o = isObj(v) ? v : {};
  const screens: Record<string, Screen> = {};
  if (isObj(o.screens)) for (const [k, s] of Object.entries(o.screens)) screens[k] = normalizeScreen(s);
  else if (isObj(o.zones)) screens.main = normalizeScreen(o);
  if (!Object.keys(screens).length) screens.desktop = normalizeScreen({});
  return { screens };
}

export const screenLayout = (doc: Doc, name?: string): Screen => doc.screens[name ?? ''] ?? Object.values(doc.screens)[0] ?? normalizeScreen({});

export const descendants = (s: Screen, id: string): string[] => Object.keys(s.zones).filter((k) => k.startsWith(id + '.'));
export const childrenOf = (doc: Doc, screen: string, id: string): string[] => descendants(screenLayout(doc, screen), id);
export function parentOf(s: Screen, id: string): string | undefined {
  for (let i = id.lastIndexOf('.'); i > 0; i = id.lastIndexOf('.', i - 1)) if (s.zones[id.slice(0, i)]) return id.slice(0, i);
  return undefined;
}

const setR = (s: Screen, rs: Record<string, Rect>): Screen => ({ ...s, zones: Object.fromEntries(Object.entries(s.zones).map(([k, z]) => [k, rs[k] ? { ...z, r: rs[k] } : z])) });

export function moveZone(s: Screen, id: string, dx: number, dy: number): Screen {
  const rs: Record<string, Rect> = {};
  for (const k of [id, ...descendants(s, id)]) { const z = s.zones[k]; if (z) rs[k] = [z.r[0] + dx, z.r[1] + dy, z.r[2], z.r[3]]; }
  return setR(s, rs);
}

export function resizeZone(s: Screen, id: string, r: Rect, keepChildren = false): Screen {
  const o = s.zones[id]?.r;
  if (!o) return s;
  const fx = o[2] ? r[2] / o[2] : 1, fy = o[3] ? r[3] / o[3] : 1;
  const rs: Record<string, Rect> = { [id]: r };
  for (const k of descendants(s, id)) {
    const c = s.zones[k]!.r;
    if (keepChildren) rs[k] = [r[0] + (c[0] + c[2] / 2 - o[0]) * fx - c[2] / 2, r[1] + (c[1] + c[3] / 2 - o[1]) * fy - c[3] / 2, c[2], c[3]];
    else rs[k] = [r[0] + (c[0] - o[0]) * fx, r[1] + (c[1] - o[1]) * fy, c[2] * fx, c[3] * fy];
  }
  return setR(s, rs);
}

// Flip ids (and their children) inside the stage; with `to`, write the flipped copy under ids renamed from prefix to[0] to to[1].
export const idTaken = (s: Screen, id: string): boolean => !!s.zones[id] || Object.keys(s.zones).some((k) => k.startsWith(id + '.'));

export function mirrorZones(s: Screen, ids: string[], axis: 'v' | 'h', to?: [string, string]): Screen {
  if (to && to[0] !== to[1] && idTaken(s, to[1])) return s;
  const all = [...new Set(ids.flatMap((id) => [id, ...descendants(s, id)]))].filter((k) => s.zones[k]);
  const zones = { ...s.zones };
  for (const k of all) {
    const z = s.zones[k]!, [x, y, w, h] = z.r;
    const r: Rect = axis === 'v' ? [x, s.h - y - h, w, h] : [s.w - x - w, y, w, h];
    const nk = to && (k === to[0] || k.startsWith(to[0] + '.')) ? to[1] + k.slice(to[0].length) : k;
    zones[nk] = { ...z, r };
  }
  return { ...s, zones };
}

export function renameZone(s: Screen, from: string, to: string): Screen {
  if (!to || to === from || idTaken(s, to) || !s.zones[from] || to.startsWith(from + '.')) return s;
  return { ...s, zones: Object.fromEntries(Object.entries(s.zones).map(([k, z]) => [k === from ? to : k.startsWith(from + '.') ? to + k.slice(from.length) : k, z])) };
}

// Snap the moving edges (`move`: the whole rect; else any of 'l', 'r', 't', 'b') to the others' edges and centres within tol, else to the grid.
export function snap(r: Rect, others: Rect[], grid: number, tol: number, edges = 'move'): { r: Rect; guides: Guide[] } {
  let [x, y, w, h] = r;
  const guides: Guide[] = [];
  const best = (pts: number[], ts: number[]): [number, number] | null => {
    let b: [number, number] | null = null;
    for (const p of pts) for (const t of ts) if (Math.abs(t - p) <= tol && (!b || Math.abs(t - p) < Math.abs(b[0]))) b = [t - p, t];
    return b;
  };
  const g = (v: number) => (grid > 0 ? Math.round(v / grid) * grid : v);
  const tx = others.flatMap((o) => [o[0], o[0] + o[2] / 2, o[0] + o[2]]), ty = others.flatMap((o) => [o[1], o[1] + o[3] / 2, o[1] + o[3]]);
  if (edges === 'move') {
    const bx = best([x, x + w / 2, x + w], tx), by = best([y, y + h / 2, y + h], ty);
    if (bx) { x += bx[0]; guides.push({ axis: 'x', at: bx[1] }); } else x = g(x);
    if (by) { y += by[0]; guides.push({ axis: 'y', at: by[1] }); } else y = g(y);
    return { r: [x, y, w, h], guides };
  }
  if (edges.includes('l')) { const b = best([x], tx), nx = b ? b[1] : g(x); if (b) guides.push({ axis: 'x', at: b[1] }); w += x - nx; x = nx; }
  if (edges.includes('r')) { const b = best([x + w], tx); if (b) guides.push({ axis: 'x', at: b[1] }); w = (b ? b[1] : g(x + w)) - x; }
  if (edges.includes('t')) { const b = best([y], ty), ny = b ? b[1] : g(y); if (b) guides.push({ axis: 'y', at: b[1] }); h += y - ny; y = ny; }
  if (edges.includes('b')) { const b = best([y + h], ty); if (b) guides.push({ axis: 'y', at: b[1] }); h = (b ? b[1] : g(y + h)) - y; }
  return { r: [x, y, w, h], guides };
}

// Cards side by side without overlap: row, column, stack (one pile) or grid. scale: the card size (<= 1) at which they fit.
export function cardFit(zone: Zone, card: [number, number], cards = zone.cards ?? 0, fan: Fan = zone.fan ?? 'row'): { fits: boolean; perRow: number; scale: number } {
  const [, , w, h] = zone.r, [cw, ch] = card;
  if (cards <= 0 || cw <= 0 || ch <= 0) return { fits: true, perRow: 0, scale: 1 };
  let perRow = 1, s: number;
  if (fan === 'row') { perRow = cards; s = Math.min(w / (cards * cw), h / ch); }
  else if (fan === 'column') s = Math.min(w / cw, h / (cards * ch));
  else if (fan === 'stack') s = Math.min(w / cw, h / ch);
  else {
    s = 0;
    for (let c = 1; c <= cards; c++) { const t = Math.min(w / (c * cw), h / (Math.ceil(cards / c) * ch)); if (t > s + 1e-9) { s = t; perRow = c; } }
    if (s >= 1) perRow = Math.min(cards, Math.max(1, Math.floor(w / cw)));
  }
  return { fits: s >= 0.999, perRow, scale: Math.min(1, s) };
}

const inside = (a: Rect, b: Rect) => a[0] >= b[0] - 0.5 && a[1] >= b[1] - 0.5 && a[0] + a[2] <= b[0] + b[2] + 0.5 && a[1] + a[3] <= b[1] + b[3] + 0.5;
const overlaps = (a: Rect, b: Rect) => Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]) > 0.5 && Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]) > 0.5;

export function layoutWarnings(s: Screen): Warning[] {
  const out: Warning[] = [];
  const ids = Object.keys(s.zones).filter((k) => !s.zones[k]!.hidden);
  for (const id of ids) {
    const z = s.zones[id]!, p = parentOf(s, id);
    const f = cardFit(z, s.card);
    if (!f.fits) out.push({ id, kind: 'cards', text: `${id}: ${z.cards} cards fit only at ${Math.floor(f.scale * 100)}% of the card size` });
    if (!inside(z.r, [0, 0, s.w, s.h])) out.push({ id, kind: 'outside', text: `${id}: outside the screen` });
    else if (p && !inside(z.r, s.zones[p]!.r)) out.push({ id, kind: 'outside', text: `${id}: outside ${p}` });
    for (const o of ids) if (o > id && parentOf(s, o) === p && overlaps(z.r, s.zones[o]!.r)) out.push({ id, kind: 'overlap', text: `${id} overlaps ${o}` });
  }
  return out;
}

export function alignZones(s: Screen, ids: string[], how: 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom'): Screen {
  const rs = ids.map((k) => s.zones[k]?.r).filter((r): r is Rect => !!r);
  if (!rs.length) return s;
  const x0 = Math.min(...rs.map((r) => r[0])), x1 = Math.max(...rs.map((r) => r[0] + r[2])), y0 = Math.min(...rs.map((r) => r[1])), y1 = Math.max(...rs.map((r) => r[1] + r[3]));
  for (const k of ids) {
    const r = s.zones[k]?.r;
    if (!r) continue;
    const dx = how === 'left' ? x0 - r[0] : how === 'right' ? x1 - r[0] - r[2] : how === 'centre' ? (x0 + x1 - r[2]) / 2 - r[0] : 0;
    const dy = how === 'top' ? y0 - r[1] : how === 'bottom' ? y1 - r[1] - r[3] : how === 'middle' ? (y0 + y1 - r[3]) / 2 - r[1] : 0;
    s = moveZone(s, k, dx, dy);
  }
  return s;
}

// Equal gaps between the zones along x ('h') or y ('v'); the first and last stay.
export function distributeZones(s: Screen, ids: string[], axis: 'h' | 'v'): Screen {
  const a = axis === 'h' ? 0 : 1;
  const ks = ids.filter((k) => s.zones[k]).sort((p, q) => s.zones[p]!.r[a] - s.zones[q]!.r[a]);
  if (ks.length < 3) return s;
  const r = (k: string) => s.zones[k]!.r;
  const first = r(ks[0]!), last = r(ks[ks.length - 1]!);
  const gap = (last[a] + last[a + 2]! - first[a] - ks.reduce((t, k) => t + r(k)[a + 2]!, 0)) / (ks.length - 1);
  let at = first[a] + first[a + 2]! + gap;
  for (const k of ks.slice(1, -1)) { const d = at - r(k)[a]; s = moveZone(s, k, a ? 0 : d, a ? d : 0); at += r(k)[a + 2]! + gap; }
  return s;
}
