// The layer's onActor hook on a hand-made fake page.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEffectLayer } from './layer.ts';
import type { Run } from '../motion-frame/index.ts';

interface Fake {
  style: Record<string, string>;
  cloned?: boolean;
  classList: { add(): void };
  removeAttribute(): void;
  appendChild(k: unknown): void;
  remove(): void;
  cloneNode(): Fake;
}
const mk = (cloned = false): Fake => ({ style: {}, cloned, classList: { add() {} }, removeAttribute() {}, appendChild() {}, remove() {}, cloneNode: () => mk(true) });
const run = { id: 1, timeline: { actors: [] } } as unknown as Run<never>;
afterEach(() => void vi.unstubAllGlobals());

describe('onActor', () => {
  it('gets the source and the clone once per actor, only for a found source', () => {
    vi.stubGlobal('document', { createElement: () => mk() });
    const src = mk();
    const seen: unknown[][] = [];
    const layer = createEffectLayer({
      parent: mk() as unknown as HTMLElement,
      resolve: (id) => (id === 'a' ? (src as unknown as HTMLElement) : undefined),
      onActor: (s, c, id) => void seen.push([s, (c as unknown as Fake).cloned, id]),
    });
    for (const id of ['a', 'a', 'b']) layer.actor(run, id, [0, 0, 1, 1]);
    expect(seen).toEqual([[src, true, 'a']]);
  });
});
