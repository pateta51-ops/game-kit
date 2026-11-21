// @vitest-environment jsdom
// K511: EFFECT_NAMES lists every verb registerEffects registers, so validateSpecs accepts catalogue ids.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createVerbs, validateSpecs } from '../motion-frame/index.ts';
import { EFFECT_NAMES, registerEffects, type EffectCtx } from './index.ts';

const catalog = JSON.parse(readFileSync(join(process.cwd(), 'components/effect-library/catalog.json'), 'utf8')) as { id: string }[];

describe('K511 EFFECT_NAMES', () => {
  it('equals the names registerEffects registers', () => {
    const verbs = createVerbs<EffectCtx>();
    registerEffects(verbs).el.remove();
    expect([...EFFECT_NAMES]).toEqual(verbs.names().sort());
  });
  it('holds every catalog.json id', () => {
    expect(catalog.length).toBeGreaterThan(10);
    expect(catalog.map((c) => c.id).filter((id) => id !== 'flight' && /^[a-z]+(-[a-z]+)*$/.test(id) && !EFFECT_NAMES.includes(id))).toEqual([]);
  });
  it('validateSpecs accepts particles-rise with EFFECT_NAMES and rejects an unknown verb', () => {
    const step = (d: string) => ({ id: 's', maxMs: 400, actors: [{ id: 'a', at: [5, 5], w: 10, h: 10 }], steps: [{ t: 0, actor: 'a', dur: 400, do: d }] });
    const stages = { default: () => undefined };
    expect(validateSpecs({ ok: step('particles-rise') }, stages, EFFECT_NAMES)).toEqual([]);
    expect(validateSpecs({ bad: step('no-such-verb') }, stages, EFFECT_NAMES).join()).toContain('unknown verb');
  });
});
