import { specTime } from './canvas.ts';
import type { Fx } from './effects.ts';

export interface TypewriterSettings {
  textAlign?: string;
  rise?: boolean;
  unit?: 'word' | 'letter';
  /** Spec milliseconds per word or non-whitespace letter. Omit to fit dur. */
  pace?: number;
  /** Optional narration progress, from 0 to 1. Undefined uses the timed pace. */
  progress?: () => number | undefined;
}

function revealEnds(text: string, byWord: boolean, proportional: boolean): number[] {
  if (byWord && !proportional) return [...text.matchAll(/\S+/gu)].map((m) => m.index + m[0].length);
  const letters = [...text.matchAll(/\S/gu)];
  const words = byWord ? [...text.matchAll(/\S+/gu)] : [];
  let word = 0;
  return letters.map((m) => {
    const end = m.index + m[0].length;
    if (!byWord) return end;
    while (end > words[word]!.index + words[word]![0].length) word++;
    return words[word]!.index + words[word]![0].length;
  });
}

let nextHighlight = 0;

export function typewriter({ call, el }: Fx, settings: TypewriterSettings): (() => void) | undefined {
  Object.assign(el.style, { opacity: '1', visibility: 'visible' });
  const text = el.textContent ?? '';
  const node = el.firstChild;
  const doc = el.ownerDocument;
  const highlights = globalThis.CSS?.highlights;
  if (!node || !highlights || typeof Highlight === 'undefined' || call.dur <= 0) return undefined;

  const name = `fx-unread-${++nextHighlight}`;
  const style = doc.createElement('style');
  style.textContent = `::highlight(${name}) { color: transparent; text-shadow: none; }`;
  doc.head.append(style);
  const range = doc.createRange();
  range.setStart(node, 0);
  range.setEnd(node, text.length);
  highlights.set(name, new Highlight(range));

  const pace = typeof settings.pace === 'number' && settings.pace > 0 ? settings.pace : undefined;
  const timed = revealEnds(text, settings.unit !== 'letter', pace === undefined);
  const proportional = pace === undefined ? timed : revealEnds(text, settings.unit !== 'letter', true);
  const start = performance.now();
  let frame = 0;
  let shown = 0;
  const finish = (): void => {
    cancelAnimationFrame(frame);
    highlights.delete(name);
    style.remove();
  };
  const tick = (now: number): void => {
    const t = specTime(now - start, call);
    const duration = specTime(call.dur, call);
    const progress = settings.progress?.() ?? (pace === undefined ? t / duration : undefined);
    const ends = progress === undefined ? timed : proportional;
    const due = Math.floor(progress === undefined ? t / pace! : progress * ends.length);
    shown = Math.max(shown, due >= ends.length ? text.length : (ends[due - 1] ?? 0));
    if (shown === text.length) finish();
    else {
      range.setStart(node, shown);
      frame = requestAnimationFrame(tick);
    }
  };
  tick(start);
  return finish;
}
