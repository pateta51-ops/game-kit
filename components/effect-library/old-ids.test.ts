// @vitest-environment jsdom
// K506: ten effects take a new id; the old id stays registered as an alias and plays the same, every option included.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTimeline, createVerbs, validateSpec, type Step } from '../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from './index.ts';

const PAIRS: [string, string][] = [
  ['multi-stop-path', 'round-trip'], ['collapse-jump', 'flash-jump'], ['warp-transfer', 'light-teleport'], ['radial-streaks', 'streak-burst'], ['column-beam', 'light-pillar'],
  ['rotating-beam', 'radar-sweep'], ['dissolve', 'burn-away'], ['motes', 'particles-rise'], ['reticle', 'target-brackets'], ['sheen', 'light-sweep'],
];
const catalog = JSON.parse(readFileSync(join(process.cwd(), 'components/effect-library/catalog.json'), 'utf8')) as { id: string; demo: { steps: Record<string, unknown>[] } }[];
const animate = vi.fn<HTMLElement['animate']>();
const fake = () => ({ cancel: vi.fn(), playState: 'finished', finished: Promise.resolve(), effect: { getComputedTiming: () => ({ endTime: 100, localTime: 100 }) } }) as unknown as Animation;

function play(name: string, opts: Record<string, unknown>, own?: (name: string) => void): string {
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  animate.mockReset();
  animate.mockImplementation(fake);
  let n = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => ((n = (n * 9301 + 49297) % 233280) / 233280));
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs);
  if (own) verbs.register('rotating-beam', () => (own(name), undefined));
  const spec = { id: 'k506', maxMs: 400, actors: [{ id: 'piece', at: [50, 50] as [number, number], w: 20, h: 40 }], steps: [{ ...opts, t: 0, actor: 'piece', dur: 400, to: [150, 80], do: name } as Step] };
  const problems = validateSpec(spec, () => undefined, verbs);
  const timeline = buildTimeline(spec, () => undefined);
  const call = timeline.calls[0]!;
  let out: string;
  try {
    const verb = verbs.get(call.verb);
    out = verb ? JSON.stringify(verb(call, { id: 1, context, timeline }) ? 'finish' : 'none') : 'unknown';
  } catch (e) {
    out = `threw ${(e as Error).message}`;
  }
  context.el.remove();
  return JSON.stringify({ problems, out, keyframes: animate.mock.calls.map((c) => c[0]) });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(Element.prototype, 'animate');
  document.body.replaceChildren();
});

describe('K506 old effect ids', () => {
  for (const [old, id] of PAIRS)
    it(`K506 ${old} and ${id} play the same keyframes, with every option of the old id`, () => {
      const looks = catalog.filter((e) => e.id === old || e.id === id).map((e) => {
        const s = { ...(e.demo.steps.find((x) => x['do'] === e.id) ?? {}) };
        for (const k of ['t', 'dur', 'actor', 'do', 'to']) Reflect.deleteProperty(s, k);
        return s;
      });
      expect(looks.length).toBeGreaterThan(0);
      for (const o of looks) {
        const a = play(old, o), b = play(id, o);
        expect(JSON.parse(b)).toMatchObject({ problems: [] });
        expect((JSON.parse(b) as { out: string }).out).not.toBe('unknown');
        expect(b).toBe(a);
      }
    });
  it('K506 old ids are still listed among the registered names, the new ids added', () => {
    const verbs = createVerbs<EffectCtx>();
    registerEffects(verbs).el.remove();
    expect(PAIRS.filter(([old, id]) => !verbs.names().includes(old) || !verbs.names().includes(id))).toEqual([]);
  });
  it("K506 a game's own verb under a new id, registered before registerEffects, is kept; the old id still plays the kit's verb", () => {
    const verbs = createVerbs<EffectCtx>();
    const own = vi.fn(() => undefined);
    verbs.register('radar-sweep', own);
    registerEffects(verbs).el.remove();
    expect(verbs.get('radar-sweep')).toBe(own);
    expect(verbs.get('rotating-beam')).not.toBe(own);
    expect(verbs.has('rotating-beam')).toBe(true);
  });
  it("K506 a game's own rotating-beam, registered after the kit's, still wins for specs that say rotating-beam", () => {
    const seen: string[] = [];
    play('rotating-beam', {}, (n) => seen.push(n));
    const kit = play('radar-sweep', {}, (n) => seen.push(n));
    expect(seen).toEqual(['rotating-beam']);
    expect((JSON.parse(kit) as { out: string }).out).not.toBe('unknown');
  });
  it("K506 a game's own rotating-beam registered before registerEffects is replaced by the kit's, as before", () => {
    const verbs = createVerbs<EffectCtx>();
    const own = vi.fn(() => undefined);
    verbs.register('rotating-beam', own);
    registerEffects(verbs).el.remove();
    expect(verbs.get('rotating-beam')).not.toBe(own);
    expect(verbs.has('rotating-beam')).toBe(true);
  });
});
