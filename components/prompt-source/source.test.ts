import { describe, expect, it } from 'vitest';
import { authorityNotice, checkPromptSources, stackView, type AuthorityTable, type OpenPrompt } from './index.ts';

const table: AuthorityTable = { firstPlayerTargets: { instruction: 'Choose the target for the villain.', rule: 'The first player chooses.' } };
interface Task { kind: string; id?: string; card?: string }
const stack: Task[] = [{ kind: 'endRound', id: 'f1' }, { kind: 'internal' }, { kind: 'attack', id: 'f2', card: 'v-1' }, { kind: 'respond', id: 'f3', card: 'c-104' }];
const describeTask = (t: Task) => (t.id === undefined ? null : { frame: t.id, kind: t.kind, card: t.card });

describe('K90 prompt-source', () => {
  it('stackView: next to resolve first, internal tasks left out, the open frame marked', () => {
    const rows = stackView(stack, describeTask, 'f2');
    expect(rows.map((r) => [r.frame, r.depth, r.open, r.kind])).toEqual([
      ['f3', 0, false, 'respond'],
      ['f2', 1, true, 'attack'],
      ['f1', 2, false, 'endRound'],
    ]);
    expect(stackView([], describeTask)).toEqual([]);
  });

  it('authorityNotice: null for the player and unknown tags, the entry otherwise', () => {
    expect(authorityNotice(undefined, table)).toBeNull();
    expect(authorityNotice('player', table)).toBeNull();
    expect(authorityNotice('nope', table)).toBeNull();
    expect(authorityNotice('firstPlayerTargets', table)?.rule).toBe('The first player chooses.');
  });

  it('checkPromptSources: reports a missing source, empty clause, stale frame and unknown tag', () => {
    const states: { id: string; state: OpenPrompt | null }[] = [
      { id: 'ok', state: { source: { frame: 'f2', card: 'v-1', clause: 'Forced: deal 2 damage.' }, authority: 'firstPlayerTargets' } },
      { id: 'rule', state: { source: { frame: 'f1', clause: 'R-12' }, authority: 'player' } },
      { id: 'none', state: null },
      { id: 'nosrc', state: {} },
      { id: 'empty', state: { source: { frame: 'f3', clause: ' ' } } },
      { id: 'stale', state: { source: { frame: 'f9', clause: 'x' } } },
      { id: 'tag', state: { source: { frame: 'f3', clause: 'x' }, authority: 'enemyTeam' } },
    ];
    const frames = () => stackView(stack, describeTask).map((r) => r.frame);
    expect(checkPromptSources({ states, prompt: (s) => s, frames, authorities: table })).toEqual([
      'nosrc: the prompt names no source',
      'empty: the source names no clause',
      'stale: source frame f9 is not on the stack',
      'tag: unknown authority tag enemyTeam',
    ]);
    expect(checkPromptSources({ states: states.slice(0, 3), prompt: (s) => s })).toEqual(['ok: unknown authority tag firstPlayerTargets']);
  });
});
