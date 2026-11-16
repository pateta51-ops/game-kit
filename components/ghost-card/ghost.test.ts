import { describe, expect, it } from 'vitest';
import { ghostChoices } from './index.ts';

// Fake game: cards on a table; a choice is an ability with a source ref (id plus zone-change counter, as engine-core's).
interface Ref { id: string; zcc: number }
interface Choice { label: string; src?: Ref }
const table = new Map([['lamp', 0]]);
const last: Record<string, { name: string }> = { 'axe@0': { name: 'Axe' } };
const onBoard = (r: Ref) => table.get(r.id) === r.zcc;
const snap = (r: Ref) => last[`${r.id}@${String(r.zcc)}`];

describe('ghostChoices (K92)', () => {
  it('keeps sourceless and on-board choices on the table, groups the rest by source with its snapshot', () => {
    const cs: Choice[] = [
      { label: 'pass' },
      { label: 'lamp: light', src: { id: 'lamp', zcc: 0 } },
      { label: 'axe: after discard, draw', src: { id: 'axe', zcc: 0 } },
      { label: 'rope: after discard, heal', src: { id: 'rope', zcc: 2 } },
      { label: 'axe: after discard, gain', src: { id: 'axe', zcc: 0 } },
    ];
    const r = ghostChoices(cs, (c) => c.src, onBoard, snap);
    expect(r.onTable.map((c) => c.label)).toEqual(['pass', 'lamp: light']);
    expect(r.ghosts.map((g) => [g.source.id, g.snapshot?.name, g.choices.length])).toEqual([
      ['axe', 'Axe', 2],
      ['rope', undefined, 1],
    ]);
  });

  it('a stale ref to a card that came back is a ghost of the old copy', () => {
    table.set('axe', 1);
    const r = ghostChoices([{ label: 'x', src: { id: 'axe', zcc: 0 } }], (c: Choice) => c.src, onBoard, snap, (s) => s.id);
    expect(r.ghosts[0]?.snapshot?.name).toBe('Axe');
    expect(r.onTable).toEqual([]);
  });
});
