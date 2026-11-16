// The highlight: marks the step's targets, shades the rest of the window with holes over them and the panel, draws a
// leader from the panel to the first target, and places the panel next to them (`placePanel`). Docked (the phone): no
// shade and no placement, the first target is scrolled into view.
import { useLayoutEffect } from 'react';
import { placePanel, type Rect } from './place.ts';

export interface TutorialHighlightProps {
  /** The step's target ids (the script's `targets`). */
  readonly targets: readonly string[];
  /** The elements a target id names (default: `[data-tutorial-target~="<id>"]`, visible ones). */
  readonly find?: (id: string) => readonly HTMLElement[];
  /** The panel (default: `[data-tutorial-panel]`). */
  readonly panel?: () => HTMLElement | null;
  /** Where the panel may go, in window coordinates (default: the window, 24 px in). */
  readonly area?: () => Rect;
  readonly gap?: number;
  readonly docked?: boolean;
  /** Where to watch for changes that move targets (default: the body). */
  readonly root?: () => Element | null;
  /** Re-run when this changes (e.g. the step, the prompt id). */
  readonly version?: unknown;
}

const SVG = 'http://www.w3.org/2000/svg';
const byAttr = (id: string): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>(`[data-tutorial-target~=${JSON.stringify(id)}]`)].filter((el) => el.getClientRects().length > 0);
const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

export function TutorialHighlight(p: TutorialHighlightProps) {
  const key = p.targets.join('\n');
  useLayoutEffect(() => {
    const find = p.find ?? byAttr;
    const panelOf = p.panel ?? (() => document.querySelector<HTMLElement>('[data-tutorial-panel]'));
    const marked = new Set<HTMLElement>();
    const overlay = document.createElementNS(SVG, 'svg');
    overlay.classList.add('kit-tutorial-shade');
    overlay.setAttribute('aria-hidden', 'true');
    if (p.docked !== true) document.body.append(overlay);
    let last: HTMLElement | undefined;
    const layout = (): void => {
      const panel = panelOf();
      if (p.docked === true || panel === null) {
        overlay.innerHTML = '';
        return;
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      const targets = [...marked].filter((el) => !panel.contains(el)).map(rectOf);
      const area = p.area?.() ?? { x: 24, y: 24, w: w - 48, h: h - 48 };
      const at = placePanel(targets, { w: panel.offsetWidth, h: panel.offsetHeight }, area, p.gap);
      panel.dataset['placed'] = '';
      panel.style.left = `${String(at.x)}px`;
      panel.style.top = `${String(at.y)}px`;
      const c = { x: at.x, y: at.y, w: panel.offsetWidth, h: panel.offsetHeight };
      const hole = (r: Rect, m: number) => `<rect x="${String(r.x - m)}" y="${String(r.y - m)}" width="${String(r.w + 2 * m)}" height="${String(r.h + 2 * m)}" rx="12" fill="black"/>`;
      const t = targets[0];
      let leader = '';
      if (t !== undefined) {
        const s = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
        const e = { x: Math.max(t.x, Math.min(s.x, t.x + t.w)), y: Math.max(t.y, Math.min(s.y, t.y + t.h)) };
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const k = Math.min(c.w / 2 / Math.max(1, Math.abs(dx)), c.h / 2 / Math.max(1, Math.abs(dy)));
        if (k < 1) leader = `<line class="kit-tutorial-leader" x1="${String(s.x + dx * k)}" y1="${String(s.y + dy * k)}" x2="${String(e.x)}" y2="${String(e.y)}" marker-end="url(#kit-tutorial-arrow)"/>`;
      }
      overlay.setAttribute('viewBox', `0 0 ${String(w)} ${String(h)}`);
      overlay.innerHTML = `<defs><mask id="kit-tutorial-cut"><rect width="100%" height="100%" fill="white"/>${hole(c, 8)}${targets.map((r) => hole(r, 12)).join('')}</mask><marker id="kit-tutorial-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path class="kit-tutorial-arrow" d="M0 0 L10 5 L0 10"/></marker></defs><rect class="kit-tutorial-dim" width="100%" height="100%" mask="url(#kit-tutorial-cut)"/>${leader}`;
    };
    const mark = (): void => {
      const now = new Set(p.targets.flatMap((id) => find(id)));
      for (const el of marked) if (!now.has(el)) el.classList.remove('kit-tutorial-target');
      marked.clear();
      for (const el of now) {
        el.classList.add('kit-tutorial-target');
        marked.add(el);
      }
      const first = [...marked][0];
      if (p.docked === true && first !== undefined && first !== last) first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      last = first;
      layout();
    };
    mark();
    const observer = new MutationObserver((rs) => {
      if (rs.some((r) => !overlay.contains(r.target))) mark();
    });
    observer.observe(p.root?.() ?? document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'open', 'data-tutorial-target'] });
    window.addEventListener('resize', mark);
    document.addEventListener('scroll', mark, true);
    const panel = panelOf();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout);
    if (panel !== null) resize?.observe(panel);
    return () => {
      observer.disconnect();
      resize?.disconnect();
      window.removeEventListener('resize', mark);
      document.removeEventListener('scroll', mark, true);
      overlay.remove();
      for (const el of marked) el.classList.remove('kit-tutorial-target');
      const pl = panelOf();
      if (pl !== null) {
        delete pl.dataset['placed'];
        pl.style.left = '';
        pl.style.top = '';
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, p.docked, p.version]);
  return null;
}
