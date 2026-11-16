// K238 (GAPS-3 engine B1): the three steps of worked-example.md run on fake/timed.ts.
import { describe, expect, it } from 'vitest';
import { applyAction, would } from './index.ts';
import { answer, SHIELD, startTimed, timedGame } from './fake/timed.ts';

describe('worked example: damage, prevention, trigger', () => {
  const g = timedGame(
    { preventions: () => [{ id: 'shield', prevention: SHIELD }], onPrevent: () => undefined, triggersFor: () => [{ ability: 'heal', source: 'c1', player: 'p2' }], resolveTrigger: (ctx) => ctx.then({ kind: 'heal' }) },
    { chosen: (ctx) => { ctx.then({ kind: 'timing.triggers' }, { kind: 'end' }); would(ctx, ctx.s.rules.items); } },
  );
  it('3 damage, the player uses the shield (prevents 2), the damaged trigger heals 1', () => {
    const s0 = startTimed(g);
    const s1 = applyAction(g, s0, answer(s0, 'hit'), null).state;
    expect(s1.prompt?.options.map((o) => o.id)).toEqual(['shield', 'pass']);
    const s2 = applyAction(g, s1, answer(s1, 'shield'), null).state;
    const r = applyAction(g, s2, answer(s2, 'pass'), null); // no `uses` cap on this offer, so it is offered again: pass
    expect(r.state.result).toEqual({ hp: 10 });
    expect(r.events.map((e) => e.type)).toContain('damaged');
    expect(r.events.find((e) => e.type === 'healed')).toMatchObject({ n: 1 });
  });
  it('passing the shield: 3 damage, then the heal', () => {
    const s0 = startTimed(g);
    const s1 = applyAction(g, s0, answer(s0, 'hit'), null).state;
    expect(applyAction(g, s1, answer(s1, 'pass'), null).state.result).toEqual({ hp: 8 });
  });
});
