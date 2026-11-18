/** One printed text a game places on a card face: its box (px), the font size it draws at and an optional font name. */
export interface FitField { name: string; text: string; box: { w: number; h: number }; size: number; font?: string; floor?: number }
export interface FitFace { id: string; fields: FitField[] }
/** Wrapped text at a size inside `maxWidth`: its widest line and its height (a game's canvas measure, or `wrapMeasure`). */
export type Measure = (text: string, size: number, font: string | undefined, maxWidth: number) => { w: number; h: number };
export interface FitIssue { id: string; field: string; kind: 'below-floor' | 'overflow'; message: string }
export interface FaceFitOptions { faces: readonly FitFace[]; floor: number | Record<string, number>; measure: Measure; /** px a box may be overrun by before it is an overflow (default 0; a game's measure is only as exact as its canvas) */ tolerance?: number }

/** A Measure from a one-line width function: greedy word wrap, each line `lineHeight` times the size high. */
export const wrapMeasure = (width: (text: string, size: number, font: string | undefined) => number, lineHeight = 1.2): Measure => (text, size, font, maxWidth) => {
  let lines = 0, widest = 0, cur = '';
  const push = () => { lines++; widest = Math.max(widest, width(cur, size, font)); };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur === '' ? word : `${cur} ${word}`;
    if (cur !== '' && width(next, size, font) > maxWidth) { push(); cur = word; } else cur = next;
  }
  if (cur !== '' || lines === 0) push();
  return { w: widest, h: lines * size * lineHeight };
};

/** Every card and field whose printed text is drawn under the pixel floor or does not fit its box. */
export function faceFitCheck(o: FaceFitOptions): FitIssue[] {
  const out: FitIssue[] = [];
  for (const face of o.faces)
    for (const f of face.fields) {
      const floor = f.floor ?? (typeof o.floor === 'number' ? o.floor : o.floor[f.name] ?? 0);
      if (f.size < floor) out.push({ id: face.id, field: f.name, kind: 'below-floor', message: `font size ${String(f.size)} px is under the floor of ${String(floor)} px` });
      const m = o.measure(f.text, f.size, f.font, f.box.w);
      const tol = o.tolerance ?? 0;
      if (m.w > f.box.w + tol + 1e-6 || m.h > f.box.h + tol + 1e-6)
        out.push({ id: face.id, field: f.name, kind: 'overflow', message: `text needs ${m.w.toFixed(1)} x ${m.h.toFixed(1)} px but the box is ${String(f.box.w)} x ${String(f.box.h)} px at ${String(f.size)} px` });
    }
  return out;
}
