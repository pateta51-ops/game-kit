import type { Verb } from './player.ts';
import type { VerbCall } from './timeline.ts';

export interface ClassToggle { dur?: number; ease?: string; prop?: string }

// Warp's enemy attack lift: the class goes on with an eased transition and comes off at once.
export function classToggle(el: HTMLElement, cls: string, o: ClassToggle = {}): () => void {
  el.style.transition = `${o.prop ?? 'transform'} ${String(o.dur ?? 200)}ms ${o.ease ?? 'ease'}`;
  el.classList.add(cls);
  return () => {
    el.style.transition = 'none';
    el.classList.remove(cls);
    void el.offsetWidth;
    el.style.removeProperty('transition');
  };
}

export function classToggleVerb<C = undefined>(find: (call: VerbCall) => HTMLElement | null, cls: string, o?: ClassToggle): Verb<C> {
  return (call) => {
    const el = find(call);
    return el ? classToggle(el, cls, o) : undefined;
  };
}
