import type { MotionPlayer } from './player.ts';
import type { MotionSpec } from './timeline.ts';

export interface MotionLabOptions {
  specs: Readonly<Record<string, MotionSpec>>;
  player: Pick<MotionPlayer, 'play' | 'skipAll'>;
}

/** A list with one button per motion of the catalog; a press ends all that plays on `player` (give the lab its own player, not the game's) and plays that one. Returns the unmount. */
export function mountMotionLab(root: HTMLElement, o: MotionLabOptions): () => void {
  const doc = root.ownerDocument;
  root.querySelector('ul.motion-lab')?.remove();
  const list = doc.createElement('ul');
  list.className = 'motion-lab';
  for (const [name, spec] of Object.entries(o.specs)) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.dataset.beat = name;
    b.textContent = `${name} (${String(spec.maxMs ?? '?')} ms, ${spec.frequency ?? '?'})`;
    b.addEventListener('click', () => {
      o.player.skipAll();
      b.dataset.playing = 'true';
      o.player.play(name, {
        onEnd: () => {
          b.removeAttribute('data-playing');
        },
      });
    });
    list.appendChild(doc.createElement('li')).appendChild(b);
  }
  root.appendChild(list);
  return () => {
    list.remove();
  };
}
