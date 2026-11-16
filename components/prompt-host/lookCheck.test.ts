import { describe, expect, it } from 'vitest';
import { checkLook } from './index.ts';

describe('checkLook (K235 A6)', () => {
  it('lists every word left at the kit placeholder, none when the game supplies all', () => {
    expect(checkLook({ label: (o: { id: string }) => o.id, done: 'Done' })).toHaveLength(6);
    const all = { label: () => 'x', done: 'Fertig', less: 'weniger', more: 'mehr', confirm: 'Ja', cancel: 'Nein', count: () => '1' };
    expect(checkLook(all)).toEqual([]);
    expect(checkLook({ ...all, cancel: undefined })).toEqual(["look.cancel is the kit placeholder: supply the game's words"]);
  });
});
