// The overlay layer: one element above the page that holds the clones and stand-ins the effects animate.
import type { Rect, Run } from '../motion-frame/index.ts';

export interface LayerOptions {
  /** the element that holds the layer (default `document.body`) */
  parent?: HTMLElement;
  /** the page element an actor or zone id stands for; the layer animates a clone of it, never the original. None found: a plain box. */
  resolve?: (id: string, run: Run<EffectLayer>) => HTMLElement | undefined;
  /** called once per actor right after its clone is made and placed in the layer, only when `resolve` found a source (a clone does not copy a canvas's pixels: draw them here, or swap the content) */
  onActor?: (source: HTMLElement, clone: HTMLElement, id: string, run: Run<EffectLayer>) => void;
}
export interface EffectLayer {
  el: HTMLElement;
  /** the clone (or stand-in) of an actor in this run, made at `from` on first use */
  actor(run: Run<EffectLayer>, id: string, from: Rect): HTMLElement;
  /** makes the stand-ins of all the beat's actors now, at its start (call it from the player's `onBeatStart`); otherwise each is made at its first verb */
  start(run: Run<EffectLayer>): void;
  /** removes the run's clones: call it from the player's `onBeatEnd` */
  end(run: Run<EffectLayer>): void;
  clear(): void;
}

export const place = (el: HTMLElement, r: Rect): void => {
  const s = el.style;
  s.left = `${String(r[0])}px`;
  s.top = `${String(r[1])}px`;
  s.width = `${String(r[2])}px`;
  s.height = `${String(r[3])}px`;
};

export function createEffectLayer(o: LayerOptions = {}): EffectLayer {
  const parent = o.parent ?? document.body;
  const el = document.createElement('div');
  el.className = 'fx-layer';
  el.style.cssText = 'position:fixed;inset:0;overflow:visible;pointer-events:none;z-index:var(--fx-z,1000)';
  parent.appendChild(el);
  const runs = new Map<number, Map<string, HTMLElement>>();
  const self: EffectLayer = {
    el,
    start(run) {
      for (const a of run.timeline.actors) self.actor(run, a.id, a.rect);
    },
    actor(run, id, from) {
      let m = runs.get(run.id);
      if (m === undefined) runs.set(run.id, (m = new Map<string, HTMLElement>()));
      let a = m.get(id);
      if (a === undefined) {
        const src = o.resolve?.(id, run);
        a = src ? (src.cloneNode(true) as HTMLElement) : document.createElement('div');
        a.classList.add('fx-actor');
        a.removeAttribute('id');
        const s = a.style;
        s.position = 'absolute';
        s.boxSizing = 'border-box';
        s.margin = '0';
        s.transform = '';
        place(a, from);
        const spec = run.timeline.actors.find((x) => x.id === id);
        if (spec?.hidden) s.opacity = '0';
        else if (spec?.opacity !== undefined) s.opacity = String(spec.opacity);
        if (spec?.veil) {
          a.classList.add('fx-veil');
          s.background = 'var(--fx-veil)';
        }
        el.appendChild(a);
        m.set(id, a);
        if (src) o.onActor?.(src, a, id, run);
      }
      return a;
    },
    end(run) {
      runs.get(run.id)?.forEach((a) => {
        a.remove();
      });
      runs.delete(run.id);
    },
    clear() {
      runs.clear();
      el.replaceChildren();
    },
  };
  return self;
}
