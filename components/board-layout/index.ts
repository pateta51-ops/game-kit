export type Rect = [number, number, number, number];
export type LayoutNode = { name: string | null; group: string; rect: Rect; x: number; y: number };
export type Edge = [string, string, number, number, number, number];
export type Layout = { nodes: Record<string, Rect>; groups: Record<string, Record<string, Rect>>; edges: Edge[]; adjacency: Record<string, string[]>; warnings: string[] };

const r = Math.round;
const num = (line: string) => Number(line.split('"')[1]);

// Lifted from Rally the Troops tools/parse-layout.js (ISC). Reads an Inkscape SVG saved one attribute per line, no transform attributes.
export function parseLayout(svgs: string | string[]): Layout {
  const nodes: LayoutNode[] = [];
  const edges: { group: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  const labels: { name: string; x: number; y: number }[] = [];
  const warnings: string[] = [];
  const stack: string[] = [];
  let mode: string | null = null, group = '', name: string | null = null;
  let x = 0, y = 0, w = 0, h = 0, cx = 0, cy = 0, rx = 0, ry = 0, x2 = 0, y2 = 0;

  const flush = () => {
    if (mode === 'path') edges.push({ group, x1: x, y1: y, x2, y2 });
    if (mode === 'rect') nodes.push({ group, name, x: x + w / 2, y: y + h / 2, rect: [x, y, w, h] });
    if (mode === 'circle') nodes.push({ group, name, x: cx, y: cy, rect: [cx - rx, cy - ry, rx * 2, ry * 2] });
    x = y = x2 = y2 = w = h = cx = cy = rx = ry = 0;
    name = null;
  };

  const pathData = (p: string[]) => {
    let px = 0, py = 0, abs = false;
    const n = (k: number) => Number(p[k]);
    for (let i = 0; i < p.length;) {
      switch (p[i]) {
        case 'M': x = px = n(i + 1); y = py = n(i + 2); i += 3; abs = true; break;
        case 'm': x = px = px + n(i + 1); y = py = py + n(i + 2); i += 3; abs = false; break;
        case 'C': x2 = px = n(i + 5); y2 = py = n(i + 6); i += 7; abs = true; break;
        case 'L': i += 1; abs = true; break;
        case 'H': x2 = px = n(i + 1); y2 = py; i += 2; abs = true; break;
        case 'V': x2 = px; y2 = py = n(i + 1); i += 2; abs = true; break;
        case 'c': x2 = px = px + n(i + 5); y2 = py = py + n(i + 6); i += 7; break;
        case 'l': i += 1; abs = false; break;
        case 'h': x2 = px = px + n(i + 1); y2 = py; i += 2; abs = false; break;
        case 'v': x2 = px; y2 = py = py + n(i + 1); i += 2; abs = false; break;
        default:
          if (abs) { x2 = px = n(i); y2 = py = n(i + 1); } else { x2 = px = px + n(i); y2 = py = py + n(i + 1); }
          i += 2;
      }
    }
  };

  for (const svg of Array.isArray(svgs) ? svgs : [svgs]) {
    mode = null;
    for (let line of svg.split('\n')) {
      line = line.trim();
      if (line.startsWith('<g')) { flush(); mode = 'g'; }
      else if (line.startsWith('<rect')) { flush(); mode = 'rect'; x = y = w = h = 0; }
      else if (line.startsWith('<ellipse') || line.startsWith('<circle')) { flush(); mode = 'circle'; cx = cy = rx = ry = 0; }
      else if (line.startsWith('<path')) { flush(); mode = 'path'; }
      else if (line.startsWith('x="')) x = r(num(line));
      else if (line.startsWith('y="')) y = r(num(line));
      else if (line.startsWith('width="')) w = r(num(line));
      else if (line.startsWith('height="')) h = r(num(line));
      else if (line.startsWith('cx="')) cx = r(num(line));
      else if (line.startsWith('cy="')) cy = r(num(line));
      else if (line.startsWith('r="')) rx = ry = r(num(line));
      else if (line.startsWith('rx="')) rx = r(num(line));
      else if (line.startsWith('ry="')) ry = r(num(line));
      else if (line.startsWith('d="')) pathData((line.split('"')[1] ?? '').split(/[ ,]/));
      else if (line.startsWith('inkscape:label="') && mode === 'g') { stack.push(line.split('"')[1] ?? ''); group = stack.join('/'); }
      else if (line.startsWith('inkscape:label="')) name = (line.split('"')[1] ?? '').replaceAll('&amp;', '&');
      else if (line.startsWith('</g>')) { flush(); mode = null; stack.pop(); group = stack.join('/'); }

      if (line.endsWith('/>') && mode === 'g') { flush(); mode = null; stack.pop(); group = stack.join('/'); }

      if (line.includes('</tspan>')) {
        const t = line.replace(/^[^>]*>/, '').replace(/<\/tspan.*/, '');
        if (labels.some((l) => l.name === t)) warnings.push(`DUPLICATE LABEL ${t}`);
        labels.push({ name: t, x, y });
      }
    }
    flush();
  }

  const closest = <T extends { x: number; y: number }>(list: T[], px: number, py: number, limit = Infinity) => {
    let best: T | undefined, bd = Infinity;
    for (const n of list) { const d = Math.hypot(n.x - px, n.y - py); if (d < bd) { bd = d; best = n; } }
    return best && bd <= limit ? best : undefined;
  };

  if (labels.length > 0) {
    for (const n of nodes) if (n.name === null) {
      const l = closest(labels, n.x, n.y, 75);
      if (l) n.name = l.name; else warnings.push(`LABEL NOT FOUND ${n.x} ${n.y}`);
    }
  }

  const out: Layout = { nodes: {}, groups: {}, edges: [], adjacency: {}, warnings };
  for (const n of nodes) {
    const k = String(n.name);
    out.nodes[k] = n.rect;
    (out.groups[n.group] ??= {})[k] = n.rect;
  }
  const named = nodes.map((n) => ({ name: String(n.name), x: n.x, y: n.y }));
  for (const e of edges) {
    const a = closest(named, e.x1, e.y1)?.name, b = closest(named, e.x2, e.y2)?.name;
    if (a === undefined || b === undefined) { warnings.push(`NOT FOUND ${e.x1} ${e.y1}`); continue; }
    out.edges.push([a, b, e.x1 | 0, e.y1 | 0, e.x2 | 0, e.y2 | 0]);
    (out.adjacency[a] ??= []).push(b);
    (out.adjacency[b] ??= []).push(a);
  }
  return out;
}

// Lifted from Rally the Troops tools/new-layout.js (ISC). A blank layout SVG with the board picture as backdrop; names are `name` or `name,color,w,h,x,y` lines.
export function newLayoutSvg(width: number, height: number, image: string, names: string[] = []): string {
  const out = [`<?xml version="1.0" encoding="UTF-8"?>
<svg
	xmlns="http://www.w3.org/2000/svg"
	xmlns:xlink="http://www.w3.org/1999/xlink"
	xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
	xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
	width="${width}"
	height="${height}"
>
<image xlink:href="${image}" x="0" y="0" width="${width}" height="${height}" image-rendering="pixelated" sodipodi:insensitive="true" />`];
  let y = 0, x = width + 10;
  for (const l of names) {
    let name = l, color = 'black', rw = 0, rh = 0, rx = 0, ry = 0;
    if (l.includes(',')) {
      const p = l.split(',');
      name = p[0] ?? '';
      color = p[1] ?? 'black';
      rw = Number(p[2] ?? 0); rh = Number(p[3] ?? 0); rx = Number(p[4] ?? 0); ry = Number(p[5] ?? 0);
    }
    name = name.replaceAll('&', '&amp;');
    if (!rw || !rh) rw = rh = 50;
    if (!rx || !ry) {
      rx = x; ry = y; y += rh + 10;
      if (y > height) { y = 0; x += rw + 10; }
    }
    out.push(`<rect inkscape:label="${name}" fill-opacity="0.5" fill="${color}" x="${rx}" y="${ry}" width="${rw}" height="${rh}"/>`);
  }
  out.push('</svg>');
  return out.join('\n');
}

export const spaceAt = (layout: Pick<Layout, 'nodes'>, px: number, py: number): string | undefined =>
  Object.entries(layout.nodes).find(([, [x, y, w, h]]) => px >= x && px <= x + w && py >= y && py <= y + h)?.[0];
