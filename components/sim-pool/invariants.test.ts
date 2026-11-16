import { describe, expect, it } from 'vitest';
import { stateAt } from '../engine-core/index.ts';
import { simGame } from './fake/undo.ts';
import { breakAt, fuzz } from './index.ts';

const um = new URL('./fake/undo.ts', import.meta.url).href;

describe('K120: bad undo, dead end, placeholder prompt, breakpoint', () => {
  it('fails a random draw without a reveal as a bad-undo violation; a revealing draw passes', async () => {
    const bad = await fuzz(um, { seed: 'u-1' });
    expect(bad.findings.map((f) => [f.kind, f.step, f.messages[0]?.startsWith('bad-undo:')])).toEqual([['violation', 1, true]]);
    expect((await fuzz(um, { seed: 'good-1' })).findings).toEqual([]);
  });
  it('fails a dead end and a placeholder prompt', async () => {
    expect((await fuzz(um, { seed: 'dead-1' })).findings[0]?.messages[0]).toMatch(/^dead end: no legal answer/);
    expect((await fuzz(um, { seed: 'ph-1' })).findings[0]?.messages[0]).toMatch(/^placeholder prompt \d+: TODO:/);
  });
  it('a breakpoint hands back a history that replays to the same state', async () => {
    const content = await simGame.content();
    const b = breakAt(simGame, content, { index: 0, seed: 'good-2', driver: 'random' }, (s) => s.turn >= 2);
    expect(b.history.cursor).toBe(b.history.actions.length);
    expect(b.state.turn).toBe(2);
    expect(stateAt(simGame.rules, b.history, content)).toEqual(b.state);
  });
});
