// The overlay layer: one element above the page that holds the clones and stand-ins the effects animate.
import { endGlEffects } from './gl.ts';
import type { Actor, Rect, Run, Stage } from '../motion-frame/index.ts';

export function decorativeCopy(el: HTMLElement, deep = true): HTMLElement {
  const copy = el.cloneNode(deep) as HTMLElement;
  for (const node of [copy, ...copy.querySelectorAll('[id], [data-card-id]')]) {
    node.removeAttribute('id');
    node.removeAttribute('data-card-id');
  }
  return copy;
}

export interface LayerOptions {
  /** the element that holds the layer (default `document.body`) */
  parent?: HTMLElement;
  /** z-index of the layer (default `var(--fx-z, 1000)`) */
  zIndex?: number | string;
  /** `absolute` fills `parent` (a positioned board layer) instead of the page (default `fixed`) */
  position?: 'fixed' | 'absolute';
  /** the page element an actor or zone id stands for; the layer animates a clone of it, never the original. None found: a plain box. */
  resolve?: (id: string, run: Run<EffectLayer>) => HTMLElement | undefined;
  /** Stage geometry for dash-line endpoints, including their original sizes. */
  stage?: Stage;
  /** called once per actor right after its clone is made and placed in the layer, only when `resolve` found a source (a clone does not copy a canvas's pixels: draw them here, or swap the content) */
  onActor?: (source: HTMLElement, clone: HTMLElement, id: string, run: Run<EffectLayer>) => void;
}
export interface EffectActor extends Actor {
  hideSource?: 'start' | 'step';
}

export interface EffectLayer {
  el: HTMLElement;
  /** the clone (or stand-in) of an actor in this run, made at `from` on first use */
  actor(run: Run<EffectLayer>, id: string, from: Rect): HTMLElement;
  /** makes the stand-ins of all the beat's actors now, at its start (call it from the player's `onBeatStart`); otherwise each is made at its first verb */
  start(run: Run<EffectLayer>, actors?: readonly EffectActor[]): void;
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
  el.style.cssText = `position:${o.position ?? 'fixed'};inset:0;overflow:visible;pointer-events:none;z-index:var(--fx-z,1000)`;
  if (o.zIndex !== undefined) el.style.zIndex = String(o.zIndex);
  parent.appendChild(el);
  const runs = new Map<number, Map<string, HTMLElement>>();
  const originals = new WeakMap<HTMLElement, HTMLElement>();
  const sources = new Map<number, Map<string, HTMLElement>>();
  const pending = new Map<number, ReturnType<typeof setTimeout>[]>();
  const hidden = new Map<HTMLElement, { count: number; value: string; priority: string }>();
  const restore = (id: number): void => {
    for (const timer of pending.get(id) ?? []) clearTimeout(timer);
    pending.delete(id);
    for (const src of sources.get(id)?.values() ?? []) {
      const saved = hidden.get(src);
      if (saved && --saved.count === 0) {
        src.style.setProperty('visibility', saved.value, saved.priority);
        hidden.delete(src);
      }
    }
    sources.delete(id);
  };
  const self: EffectLayer = {
    el,
    start(run, actors) {
      for (const a of run.timeline.actors) self.actor(run, a.id, a.rect);
      if (sources.has(run.id)) return;
      const held = new Map<string, HTMLElement>();
      const timers: ReturnType<typeof setTimeout>[] = [];
      const scheduled = new Set<string>();
      for (const a of actors ?? []) {
        const clone = runs.get(run.id)?.get(a.id);
        const src = clone && originals.get(clone);
        if (!a.hideSource || !src || scheduled.has(a.id)) continue;
        const hide = (): void => {
          const saved = hidden.get(src);
          if (saved) saved.count++;
          else {
            hidden.set(src, { count: 1, value: src.style.visibility, priority: src.style.getPropertyPriority('visibility') });
            src.style.setProperty('visibility', 'hidden', 'important');
          }
          held.set(a.id, src);
        };
        if (a.hideSource === 'start') hide();
        else {
          const first = run.timeline.calls.find((call) => call.actor === a.id);
          if (!first) continue;
          timers.push(setTimeout(hide, first.t));
        }
        scheduled.add(a.id);
      }
      if (scheduled.size > 0) sources.set(run.id, held);
      if (timers.length > 0) pending.set(run.id, timers);
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
        if (src) {
          originals.set(a, src);
          const saved = hidden.get(src);
          if (saved) s.setProperty('visibility', saved.value, saved.priority);
          o.onActor?.(src, a, id, run);
        }
      }
      return a;
    },
    end(run) {
      endGlEffects(self, run);
      runs.get(run.id)?.forEach((a) => {
        a.remove();
      });
      runs.delete(run.id);
      restore(run.id);
    },
    clear() {
      endGlEffects(self);
      for (const id of sources.keys()) restore(id);
      runs.clear();
      el.replaceChildren();
    },
  };
  return self;
}
