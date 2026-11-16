import { describe, expect, it } from 'vitest';
import { checkGallery, checkStates, fixtureId, galleryEntries, isDevMode, keepBest, loadFixture, type Fixture, type GallerySpec, type Seen } from './index.ts';

// The fake game "Lanterns": light lamps until the row is lit (won) or the oil runs out (lost).
interface Lanterns {
  readonly prompt: string | null;
  readonly result: string | null;
  readonly lamps: number;
}
const at = (prompt: string | null, result: string | null = null, lamps = 0): Lanterns => ({ prompt, result, lamps });
const fx = (group: Fixture<Lanterns>['group'], kind: string, state: Fixture<Lanterns>['state']): Fixture<Lanterns> => ({ group, kind, state });
const spec = (fixtures: readonly Fixture<Lanterns>[], prompts = ['light', 'trim'], endings = ['won', 'lost']): GallerySpec<Lanterns> => ({
  prompts,
  endings,
  fixtures,
  kindOf: (s, group) => (group === 'prompt' ? s.prompt : s.result),
});
const FULL = [fx('prompt', 'light', () => at('light')), fx('prompt', 'trim', () => Promise.resolve(at('trim'))), fx('ending', 'won', () => at(null, 'won')), fx('ending', 'lost', () => at(null, 'lost'))];

describe('checkGallery', () => {
  it('is empty when every prompt kind and ending has one fixture', () => {
    expect(checkGallery(spec(FULL))).toEqual([]);
    expect(checkGallery(spec(FULL.slice(0, 2), ['light', 'trim'], []))).toEqual([]);
  });

  it('fails on an empty prompts list', () => {
    expect(checkGallery(spec([], [], []))).toEqual(['the game lists no prompt kinds']);
    expect(checkGallery(spec([FULL[2]!], [], ['won']))).toEqual(['the game lists no prompt kinds']);
  });

  it('names a kind with no fixture, a fixture of an unlisted kind and a second fixture', () => {
    expect(checkGallery(spec([FULL[0]!, FULL[0]!, fx('prompt', 'won', () => at('won')), FULL[2]!]))).toEqual([
      'prompt kind trim has no fixture',
      'ending kind lost has no fixture',
      'fixture prompt:light is there twice',
      'fixture prompt:won is of a kind the game does not list',
    ]);
  });

  it('fails when the game adds a kind', () => {
    expect(checkGallery(spec(FULL, ['light', 'trim', 'refill']))).toEqual(['prompt kind refill has no fixture']);
  });
});

describe('galleryEntries', () => {
  it('lists prompts then endings in the game order, a missing one with null', () => {
    const e = galleryEntries(spec([FULL[3]!]));
    expect(e.map((x) => x.id)).toEqual(['prompt:light', 'prompt:trim', 'ending:won', 'ending:lost']);
    expect(e.map((x) => x.fixture !== null)).toEqual([false, false, false, true]);
  });
});

describe('loadFixture and checkStates', () => {
  it('loads plain and promised states', async () => {
    expect(await checkStates(spec(FULL))).toEqual([]);
    expect(await loadFixture(spec(FULL), FULL[1]!)).toEqual({ ok: true, state: at('trim') });
  });

  it('reports a state that shows another kind, none, a throw, a rejection and one that never loads', async () => {
    const never = new Promise<Lanterns>(() => undefined);
    const bad = spec([
      fx('prompt', 'light', () => at('trim')),
      fx('prompt', 'trim', () => at(null)),
      fx('ending', 'won', () => {
        throw new Error('seed 7 no longer replays');
      }),
      fx('ending', 'lost', () => Promise.reject(new Error('no file'))),
      fx('prompt', 'slow', () => never),
    ]);
    expect(await checkStates(bad, 20)).toEqual([
      'fixture prompt:light: shows trim, not light',
      'fixture prompt:trim: shows no prompt, not trim',
      'fixture ending:won: seed 7 no longer replays',
      'fixture ending:lost: no file',
      'fixture prompt:slow: did not load in 20 ms',
    ]);
  });

  it('takes the state as it is without kindOf', async () => {
    const s: GallerySpec<Lanterns> = { prompts: ['light'], endings: [], fixtures: [fx('prompt', 'light', () => at('trim'))] };
    expect(await checkStates(s)).toEqual([]);
  });
});

describe('keepBest', () => {
  const seen = (group: Seen<string>['group'], kind: string, value: string, score?: number): Seen<string> => (score === undefined ? { group, kind, value } : { group, kind, value, score });

  it('keeps the first seen per kind without scores', () => {
    const best = keepBest([seen('prompt', 'light', 'a'), seen('prompt', 'light', 'b'), seen('ending', 'won', 'c')]);
    expect([...best]).toEqual([
      [fixtureId('prompt', 'light'), 'a'],
      ['ending:won', 'c'],
    ]);
  });

  it('keeps the highest score, the first on a tie, and nothing from nothing', () => {
    expect(keepBest([seen('prompt', 'light', 'a', 2), seen('prompt', 'light', 'b', 5), seen('prompt', 'light', 'c', 5), seen('prompt', 'light', 'd', -1)]).get('prompt:light')).toBe('b');
    expect(keepBest([]).size).toBe(0);
  });

  it('takes a generator that plays games', () => {
    function* play(): Generator<Seen<number>> {
      for (let lamps = 0; lamps < 4; lamps += 1) yield { group: 'prompt', kind: lamps % 2 === 0 ? 'light' : 'trim', score: lamps, value: lamps };
      yield { group: 'ending', kind: 'won', value: 4 };
    }
    expect(Object.fromEntries(keepBest(play()))).toEqual({ 'prompt:light': 2, 'prompt:trim': 3, 'ending:won': 4 });
  });
});

describe('isDevMode', () => {
  it('reads dev=1 from the search where the game allows it', () => {
    expect(isDevMode('?dev=1', true)).toBe(true);
    expect(isDevMode('?x=2&dev=1', true)).toBe(true);
    expect(isDevMode('?dev=0', true)).toBe(false);
    expect(isDevMode('', true)).toBe(false);
    expect(isDevMode(undefined, true)).toBe(false);
  });

  it('is off in a production build unless the game allows it', () => {
    expect(isDevMode('?dev=1')).toBe(false);
    expect(isDevMode('?dev=1', false)).toBe(false);
  });
});
