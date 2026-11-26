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
  /** K436: `false` makes the layer no stacking context (`display: contents`, no z-index), so its parts' z-index and mix-blend-mode reach the board under it; the parts then place against `parent`'s box */
  isolate?: boolean;
}
export interface EffectActor extends Actor {
  /** Hide from beat start, or from this actor's first dispatched step, until the run ends. */
  hideSource?: 'start' | 'step';
  /** K435-10: hides only the source's descendants matching this selector (a class: `.name`), not the whole source */
  hideParts?: string;
  /** K436: the clone's own z-index and mix-blend-mode (e.g. `screen` with the board, under a layer with `isolate: false`); set by `start(run, actors)`, or per step with step `zIndex` and `blend` */
  zIndex?: number | string;
  blend?: string;
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

const waits = new WeakMap<object, Map<number, Set<() => void>>>();
const left = (a: Animation): number => {
  const c = a.effect?.getComputedTiming();
  return (Number(c?.endTime ?? 0) - Number(c?.localTime ?? 0)) / Math.abs(a.playbackRate || 1);
};
/**
 * K435-0: a step end that comes while its animations still run for at most `min(250 ms, 40% of dur)` (they started late: a slow
 * frame) waits for their `finished` (a timer of their time left + 100 ms as the fallback); earlier (a skip), or at the beat's
 * end (`last`), it ends at once. The layer's `end(run)` or `clear()` flushes a waiting end.
 */
export function endOnFinished(layer: object, run: { id: number }, anims: readonly Animation[], end: () => void, dur = Infinity, last = false): void {
  const running = anims.filter((a) => a.playState === 'running' && Number.isFinite(Number(a.effect?.getComputedTiming().endTime ?? 0)));
  if (last || running.length === 0 || Math.max(...running.map(left)) > Math.min(250, dur * 0.4)) return end();
  let m = waits.get(layer);
  if (!m) waits.set(layer, (m = new Map<number, Set<() => void>>()));
  let set = m.get(run.id);
  if (!set) m.set(run.id, (set = new Set()));
  const s = set;
  const flush = (): void => {
    if (!s.delete(flush)) return;
    clearTimeout(timer);
    end();
  };
  s.add(flush);
  const timer = setTimeout(flush, Math.max(0, ...running.map(left)) + 100);
  Promise.all(running.map((a) => a.finished)).then(flush, flush);
}
/** K435-0: ends the run's (all runs': no run) step ends still waiting on their animations */
export function flushEnds(layer: object, run?: { id: number }): void {
  const m = waits.get(layer);
  for (const set of run ? [m?.get(run.id)] : [...(m?.values() ?? [])]) for (const f of [...(set ?? [])]) f();
  if (run) m?.delete(run.id);
  else waits.delete(layer);
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
  if (o.isolate === false) el.style.cssText = 'display:contents;pointer-events:none';
  parent.appendChild(el);
  const runs = new Map<number, Map<string, HTMLElement>>();
  const originals = new WeakMap<HTMLElement, HTMLElement>();
  const sources = new Map<number, Map<string, HTMLElement[]>>();
  const pending = new Map<number, ReturnType<typeof setTimeout>[]>();
  const dispatchOff = new Map<number, () => void>();
  const hidden = new Map<HTMLElement, { count: number; value: string; priority: string }>();
  const restore = (id: number): void => {
    dispatchOff.get(id)?.();
    dispatchOff.delete(id);
    for (const timer of pending.get(id) ?? []) clearTimeout(timer);
    pending.delete(id);
    for (const src of [...(sources.get(id)?.values() ?? [])].flat()) {
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
      const held = new Map<string, HTMLElement[]>();
      const timers: ReturnType<typeof setTimeout>[] = [];
      const starts = new Map<string, () => void>();
      const scheduled = new Set<string>();
      for (const a of actors ?? []) {
        const clone = runs.get(run.id)?.get(a.id);
        if (clone && a.zIndex !== undefined) clone.style.zIndex = String(a.zIndex);
        if (clone && a.blend) clone.style.mixBlendMode = a.blend;
        const src = clone && originals.get(clone);
        if (!a.hideSource || (!src && !(a.hideSource === 'step' && run.onActorStart)) || scheduled.has(a.id)) continue;
        const hide = (): void => {
          let source = src;
          if (!source) {
            const actor = run.timeline.actors.find(actor => actor.id === a.id);
            if (!actor) return;
            const late = self.actor(run, a.id, actor.rect);
            if (sources.get(run.id) !== held) return; // onActor may synchronously clear or end this run
            if (a.zIndex !== undefined) late.style.zIndex = String(a.zIndex);
            if (a.blend) late.style.mixBlendMode = a.blend;
            source = originals.get(late);
          }
          if (!source) return;
          const els = a.hideParts ? [...source.querySelectorAll<HTMLElement>(a.hideParts)] : [source];
          for (const e of els) {
            const saved = hidden.get(e);
            if (saved) saved.count++;
            else {
              hidden.set(e, { count: 1, value: e.style.visibility, priority: e.style.getPropertyPriority('visibility') });
              e.style.setProperty('visibility', 'hidden', 'important');
            }
          }
          held.set(a.id, els);
        };
        if (a.hideSource === 'start') hide();
        else if (run.onActorStart) starts.set(a.id, () => {
          if (run.timeline.calls.some(call => call.actor === a.id)) hide();
        });
        else {
          const first = run.timeline.calls.find((call) => call.actor === a.id);
          if (!first) continue;
          timers.push(setTimeout(hide, first.t)); // compatibility for manually constructed runs
        }
        scheduled.add(a.id);
      }
      if (scheduled.size > 0) sources.set(run.id, held);
      if (timers.length > 0) pending.set(run.id, timers);
      if (starts.size > 0 && run.onActorStart) dispatchOff.set(run.id, run.onActorStart(id => {
        const hide = starts.get(id);
        starts.delete(id);
        hide?.();
      }));
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
      flushEnds(self, run);
      endGlEffects(self, run);
      runs.get(run.id)?.forEach((a) => {
        a.remove();
      });
      runs.delete(run.id);
      restore(run.id);
    },
    clear() {
      flushEnds(self);
      endGlEffects(self);
      for (const id of sources.keys()) restore(id);
      runs.clear();
      el.replaceChildren();
    },
  };
  return self;
}
