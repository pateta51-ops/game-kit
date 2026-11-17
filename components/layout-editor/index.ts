// K269: pure logic of the layout editor; editor.html carries a generated copy (build.mjs), checked by editor.test.ts.
export type Rect = [number, number, number, number];
export type Fan = 'row' | 'column' | 'stack' | 'grid';
export type Kind = 'cards' | 'component' | 'pile' | 'group';
export type Zone = { r: Rect; label?: string; cards?: number; fan?: Fan; kind?: Kind; full?: boolean; scale?: number; locked?: boolean; hidden?: boolean; [k: string]: unknown };
export type Screen = { w: number; h: number; card: [number, number]; pile?: [number, number]; zones: Record<string, Zone>; [k: string]: unknown };
export type Doc = { screens: Record<string, Screen> };
export type Guide = { axis: 'x' | 'y'; at: number };
export type Warning = { id: string; kind: 'cards' | 'overlap' | 'outside'; text: string };

const FANS = ['row', 'column', 'stack', 'grid'];
export const KINDS = ['cards', 'component', 'pile', 'group'];
const num = (v: unknown, d: number): number => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : d);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function normalizeZone(v: unknown): Zone | null {
  const o: Record<string, unknown> | null = Array.isArray(v) ? { r: v } : isObj(v) ? v : null;
  if (!o || !Array.isArray(o.r)) return null;
  const r = o.r as unknown[];
  const { r: _r, label: _l, cards: _c, fan: _f, kind: _d, full: _u, scale: _sc, locked: _k, hidden: _h, ...rest } = o;
  const z: Zone = { r: [num(r[0], 0), num(r[1], 0), num(r[2], 0), num(r[3], 0)], ...rest };
  if (typeof o.label === 'string' && o.label) z.label = o.label;
  if (o.cards !== undefined && num(o.cards, 0) > 0) z.cards = Math.round(num(o.cards, 0));
  if (typeof o.fan === 'string' && FANS.includes(o.fan)) z.fan = o.fan as Fan;
  if (typeof o.kind === 'string' && KINDS.includes(o.kind)) z.kind = o.kind as Kind;
  if (o.full === true) z.full = true;
  if (o.scale !== undefined && num(o.scale, 1) < 1 && num(o.scale, 1) > 0) z.scale = Math.max(0.2, num(o.scale, 1));
  if (o.locked === true) z.locked = true;
  if (o.hidden === true) z.hidden = true;
  return z;
}

function normalizeScreen(v: unknown): Screen {
  const o = isObj(v) ? v : {};
  const c = Array.isArray(o.card) ? (o.card as unknown[]) : [];
  const { w: _w, h: _h, card: _c, pile: _p, zones: _z, ...rest } = o;
  const s: Screen = { ...rest, w: num(o.w, 3840), h: num(o.h, 2160), card: [num(c[0], 180), num(c[1], 252)], zones: {} };
  const p = Array.isArray(o.pile) ? (o.pile as unknown[]) : [];
  if (num(p[0], 0) > 0 && num(p[1], 0) > 0) s.pile = [num(p[0], 0), num(p[1], 0)];
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
export function cardFit(zone: Zone, card: [number, number], cards = zone.cards ?? 0, fan: Fan = zone.fan ?? 'row', zs = zone.scale ?? 1): { fits: boolean; perRow: number; scale: number } {
  const [, , w, h] = zone.r, cw = card[0] * zs, ch = card[1] * zs;
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
    const k = kindOf(z), f = k === 'pile' ? cardFit(z, z.scale || z.full ? s.card : pileSize(s), 1, 'stack', z.scale ?? 1) : k === 'component' || k === 'group' ? null : cardFit(z, s.card);
    if (f && !f.fits) out.push({ id, kind: 'cards', text: k === 'pile' ? `${id}: the pile fits only at ${Math.floor(f.scale * 100)}% of its size` : `${id}: ${z.cards} cards fit only at ${Math.floor(f.scale * 100)}% of the card size` });
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

// K280: kinds, compact piles, consolidate / split, copy between screens, mode/variant screen names, zoom maths.
export const kindOf = (z: Zone): Kind | undefined => z.kind ?? (z.cards ? 'cards' : undefined);
export const pileSize = (s: Screen): [number, number] => s.pile ?? [Math.round(s.card[0] / 2), Math.round(s.card[1] / 2)];
export const pileLike = (z: Zone): boolean => z.kind === 'pile' || ((!z.kind || z.kind === 'cards') && (z.cards === 1 || z.fan === 'stack'));
export function commonPrefix(ids: string[]): string {
  const ps = ids.map((k) => k.split('.').slice(0, -1)), out: string[] = [];
  for (let i = 0; ps.length && ps.every((p) => p[i] !== undefined && p[i] === ps[0]![i]); i++) out.push(ps[0]![i]!);
  return out.join('.');
}
const last = (k: string) => k.slice(k.lastIndexOf('.') + 1);
const freeId = (s: Screen, id: string, skip: (k: string) => boolean = () => false): string => {
  const taken = (n: string) => Object.keys(s.zones).some((k) => !skip(k) && (k === n || k.startsWith(n + '.')));
  let n = id, i = 2; while (taken(n)) n = id + '-' + i++; return n;
};
const shift = (zones: Record<string, Zone>, s: Screen, k: string, nid: string, r: Rect) => {
  const z = s.zones[k]!;
  for (const c of descendants(s, k)) { const cz = s.zones[c]!; zones[nid + c.slice(k.length)] = { ...cz, r: [cz.r[0] + r[0] - z.r[0], cz.r[1] + r[1] - z.r[1], cz.r[2], cz.r[3]] }; }
};

// Lay the pile-like ids out as compact pile tiles in a new group zone `<common prefix>.piles` (or `id`); one column or one row.
export function consolidate(s: Screen, ids: string[], dir: 'column' | 'row' = 'column', id?: string): { screen: Screen; id: string } {
  const a = dir === 'row' ? 0 : 1;
  const ks = [...new Set(ids)].filter((k, _i, all) => s.zones[k] && pileLike(s.zones[k]) && !all.some((m) => k.startsWith(m + '.'))).sort((p, q) => s.zones[p]!.r[a] - s.zones[q]!.r[a] || s.zones[p]!.r[1 - a]! - s.zones[q]!.r[1 - a]!);
  if (!ks.length) return { screen: s, id: '' };
  const moving = (k: string) => ks.some((m) => k === m || k.startsWith(m + '.'));
  const pre = commonPrefix(ks), pid = id ? id : freeId(s, pre ? pre + '.piles' : 'piles', moving);
  if (id && freeId(s, id, moving) !== id) return { screen: s, id: '' };
  const [pw, ph] = pileSize(s), gap = Math.max(1, Math.round(pw / 8));
  const n = ks.length, W = a ? pw + 2 * gap : n * pw + (n + 1) * gap, H = a ? n * ph + (n + 1) * gap : ph + 2 * gap, pp = parentOf(s, pid), B: Rect = pp ? s.zones[pp]!.r : [0, 0, s.w, s.h];
  const x0 = Math.max(B[0], Math.min(B[0] + B[2] - W, ...ks.map((k) => s.zones[k]!.r[0]))), y0 = Math.max(B[1], Math.min(B[1] + B[3] - H, ...ks.map((k) => s.zones[k]!.r[1])));
  const zones = Object.fromEntries(Object.entries(s.zones).filter(([k]) => !moving(k)));
  const from: Record<string, { id: string; kind?: Kind }> = {};
  zones[pid] = { r: [x0, y0, W, H], kind: 'group', label: 'Piles', from };
  ks.forEach((k, i) => {
    const z = s.zones[k]!, nid = freeId({ ...s, zones }, pid + '.' + last(k)), r: Rect = a ? [x0 + gap, y0 + gap + i * (ph + gap), pw, ph] : [x0 + gap + i * (pw + gap), y0 + gap, pw, ph];
    const { full: _f, ...rest } = z;
    zones[nid] = { ...rest, r, kind: 'pile' };
    from[nid] = z.kind ? { id: k, kind: z.kind } : { id: k };
    shift(zones, s, k, nid, r);
  });
  return { screen: { ...s, zones }, id: pid };
}

// Undo a consolidation (a group with `from`): the children of `id` go back to their old ids at full card size, in the parent's place.
export function split(s: Screen, id: string): { screen: Screen; ids: string[] } {
  const p = s.zones[id];
  const kids = p && isObj(p.from) ? Object.keys(s.zones).filter((k) => parentOf(s, k) === id) : [];
  if (!p || !kids.length) return { screen: s, ids: [] };
  const from = (isObj(p.from) ? p.from : {}) as Record<string, { id?: string; kind?: Kind } | undefined>, pre = id.includes('.') ? id.slice(0, id.lastIndexOf('.') + 1) : '';
  const a = p.r[3] > p.r[2] ? 1 : 0, [cw, ch] = s.card, gap = Math.max(1, Math.round(cw / 8));
  const zones = Object.fromEntries(Object.entries(s.zones).filter(([k]) => k !== id && !k.startsWith(id + '.')));
  const ids: string[] = [];
  kids.forEach((k, i) => {
    const z = s.zones[k]!, f = from[k], nid = freeId({ ...s, zones }, typeof f?.id === 'string' ? f.id : pre + last(k));
    const r: Rect = a ? [p.r[0], p.r[1] + i * (ch + gap), cw, ch] : [p.r[0] + i * (cw + gap), p.r[1], cw, ch];
    const { kind: _k, full: _f, ...rest } = z, kind = f ? f.kind : z.kind;
    zones[nid] = { ...rest, r, ...(kind ? { kind } : {}), ...(kind === 'pile' ? { full: true } : {}) };
    ids.push(nid);
    shift(zones, s, k, nid, r);
  });
  return { screen: { ...s, zones }, ids };
}

// Take piles out of a consolidated box (a group with `from`): each goes back at full card size beside the box; the box shrinks to the piles left, or goes (split) when fewer than two are left.
export function takeOut(s: Screen, ids: string[]): { screen: Screen; ids: string[] } {
  const out: string[] = [];
  for (const g of new Set(ids.map((k) => parentOf(s, k)).filter((p): p is string => !!p && isObj(s.zones[p]!.from)))) {
    const take = ids.filter((k) => parentOf(s, k) === g), kids = Object.keys(s.zones).filter((k) => parentOf(s, k) === g), left = kids.filter((k) => !take.includes(k));
    if (left.length < 2) { const r = split(s, g); s = r.screen; out.push(...r.ids); continue }
    const p = s.zones[g]!, from = (p.from as Record<string, { id?: string } | undefined>), a = p.r[3] > p.r[2] ? 1 : 0, [pw, ph] = pileSize(s), gap = Math.max(1, Math.round(pw / 8)), [cw, ch] = s.card, cg = Math.max(1, Math.round(cw / 8)), pre = g.includes('.') ? g.slice(0, g.lastIndexOf('.') + 1) : '';
    left.sort((m, n) => s.zones[m]!.r[a] - s.zones[n]!.r[a]);
    const n = left.length, W = a ? pw + 2 * gap : n * pw + (n + 1) * gap, H = a ? n * ph + (n + 1) * gap : ph + 2 * gap;
    const zones = Object.fromEntries(Object.entries(s.zones).filter(([k]) => !take.some((m) => k === m || k.startsWith(m + '.'))));
    const nf = Object.fromEntries(Object.entries(from).filter(([k]) => !take.includes(k)));
    zones[g] = { ...p, r: [p.r[0], p.r[1], W, H], from: nf };
    left.forEach((k, i) => { const r: Rect = a ? [p.r[0] + gap, p.r[1] + gap + i * (ph + gap), pw, ph] : [p.r[0] + gap + i * (pw + gap), p.r[1] + gap, pw, ph]; zones[k] = { ...s.zones[k]!, r }; shift(zones, s, k, k, r); });
    const y0 = Math.max(0, Math.min(p.r[1], s.h - ch)), m = Math.max(1, Math.floor((s.h - y0 + cg) / (ch + cg))), right = p.r[0] + W + Math.ceil(take.length / m) * (cw + cg) <= s.w;
    take.forEach((k, i) => {
      const nid = freeId({ ...s, zones }, from[k]?.id ?? pre + last(k)), r: Rect = [right ? p.r[0] + W + cg + Math.floor(i / m) * (cw + cg) : p.r[0] - cg - cw - Math.floor(i / m) * (cw + cg), y0 + (i % m) * (ch + cg), cw, ch];
      const { scale: _s, ...zk } = s.zones[k]!; zones[nid] = { ...zk, r, kind: 'pile', full: true }; out.push(nid); shift(zones, s, k, nid, r);
    });
    s = { ...s, zones };
  }
  return { screen: s, ids: out };
}

// Copy a zone and its children from another screen; a taken id gets a -2 suffix.
export function copyZones(from: Screen, to: Screen, id: string): { screen: Screen; id: string } {
  if (!from.zones[id]) return { screen: to, id: '' };
  const nid = freeId(to, id), zones = { ...to.zones };
  for (const k of [id, ...descendants(from, id)]) zones[nid + k.slice(id.length)] = { ...from.zones[k]!, r: [...from.zones[k]!.r] as Rect };
  return { screen: { ...to, zones }, id: nid };
}

// Screens named `mode/variant` grouped by mode, in first-seen order.
export function screenModes(names: string[]): [string, string[]][] {
  const m = new Map<string, string[]>();
  for (const n of names) { const k = n.split('/')[0]!; m.set(k, [...(m.get(k) ?? []), n]); }
  return [...m];
}

// Stage scale and offset at `zoom` (1 = the screen fits fitW x fitH with margin m) in a view of viewW x viewH; pad: the scrolled area.
export function stageView(sw: number, sh: number, fitW: number, fitH: number, viewW: number, viewH: number, zoom: number, m = 12): { sc: number; left: number; top: number; padW: number; padH: number } {
  const sc = Math.max(1e-3, Math.min((fitW - 2 * m) / sw, (fitH - 2 * m) / sh)) * zoom, w = sw * sc, h = sh * sc;
  return { sc, left: Math.max(m, (viewW - w) / 2), top: Math.max(m, (viewH - h) / 2), padW: Math.max(viewW, w + 2 * m), padH: Math.max(viewH, h + 2 * m) };
}
export const clampZoom = (z: number): number => Math.min(20, Math.max(0.1, z));
// The scroll that puts stage point p at view offset `at`, given the scale and the stage's offset in the scrolled area.
export const keepPoint = (p: number, sc: number, off: number, at: number): number => off + p * sc - at;
