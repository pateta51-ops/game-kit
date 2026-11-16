import { describe, expect, it } from 'vitest';
import { available, begin, checkGraph, chooseNode, count, emptyLog, end, graphNext, has, holds, inGameAt, instructions, newCampaign, nodeChoice, nodeStep, record, rewardTotal, runBetween, setHas, type CampaignGraph, type CampaignSave, type Instruction } from './index.ts';

const I = (id: string, x: Partial<Instruction<string>>): Instruction<string> => ({ id, text: `printed ${id}`, cite: 'p.12', ...x });
const choice: CampaignGraph<string> = {
  kind: 'choice',
  nodes: [
    { id: 'a', label: 'A', victory: [I('va', { ops: [{ op: 'record', key: 'beatA' }] })] },
    { id: 'b', label: 'B', when: { has: 'beatA' } },
    { id: 'c', label: 'C' },
    { id: 'z', label: 'Finale' },
  ],
  finale: { node: 'z', when: { count: 'progress', atLeast: 2 } },
  failAfter: 2,
};
const play = (g: CampaignGraph, s: CampaignSave, resolution: 'won' | 'lost', write = (l: CampaignSave['log']) => l) => {
  const b = begin(s);
  return end(b.save, { log: write(b.log), resolution }, graphNext(g));
};

describe('graph runner (K158)', () => {
  it('a linear graph walks its nodes, skipping one whose test fails', () => {
    const g: CampaignGraph = { kind: 'linear', nodes: [{ id: '1', label: '1' }, { id: '2', label: '2', when: { has: 'x' } }, { id: '3', label: '3' }] };
    let s = newCampaign('c', '1', nodeStep(g.nodes[0]!), 1);
    s = play(g, s, 'won');
    expect(s.position.step).toEqual({ kind: 'scenario', id: '3' });
    expect(play(g, s, 'won').status).toBe('over');
  });
  it('a choice graph offers the available nodes; a node unlocks on the log', () => {
    let s = newCampaign('c', '1', { kind: 'scenario', id: 'a' }, 1);
    expect(nodeChoice(choice, s).options.map((o) => o.id)).toEqual(['a', 'c']);
    s = chooseNode(choice, s, 'c');
    expect(s.position.step?.id).toBe('c');
    expect(() => chooseNode(choice, s, 'b')).toThrow();
    s = chooseNode(choice, s, 'a');
    s = play(choice, s, 'won', (l) => runBetween(instructions(choice, 'a', 'victory'), l, 'a').log);
    expect(available(choice, s).map((n) => n.id)).toEqual(['b', 'c']);
  });
  it('the finale comes when its test holds, or when nothing else is left', () => {
    const s = newCampaign('c', '1', { kind: 'scenario', id: 'c' }, 1);
    expect(play(choice, s, 'won', (l) => ({ ...l, counts: { progress: 2 } })).position.step?.id).toBe('z');
    const g: CampaignGraph = { kind: 'choice', nodes: [{ id: 'c', label: 'C' }, { id: 'z', label: 'Z' }], finale: { node: 'z' } };
    const t = play(g, newCampaign('c', '1', { kind: 'scenario', id: 'c' }, 1), 'won');
    expect(t.position.step?.id).toBe('z');
    expect(play(g, t, 'won').status).toBe('over');
  });
  it('failAfter lost nodes end the campaign', () => {
    let s = play(choice, newCampaign('c', '1', { kind: 'scenario', id: 'a' }, 1), 'lost');
    expect(s.status).toBe('active');
    s = play(choice, s, 'lost');
    expect(s.status).toBe('over');
    expect(holds({ lost: 'a' }, s.log, s)).toBe(true);
    expect(holds({ won: 'a' }, s.log, s)).toBe(false);
  });
  it('conditions as data', () => {
    const l = record({ ...emptyLog(), sets: { team: { entries: ['x'], crossed: [] } } }, 'k');
    expect(holds({ all: [{ has: 'k' }, { inSet: 'team', entry: 'x' }, { not: { crossed: 'k' } }] }, l)).toBe(true);
    expect(holds({ any: [{ count: 'n', atLeast: 1 }, { played: 'a' }] }, l)).toBe(false);
    expect(holds((log) => has(log, 'k'), l)).toBe(true);
  });
});
describe('instructions (K158)', () => {
  const list = [
    I('i1', { ops: [{ op: 'add', key: 'doom', n: 2 }, { op: 'reward', entry: { label: 'xp', amount: 3 } }] }),
    I('i2', { when: { has: 'never' }, ops: [{ op: 'record', key: 'no' }] }),
    I('i3', { choose: [{ id: 'l', label: 'Left', ops: [{ op: 'insert', key: 'path', entry: 'left' }] }, { id: 'r', label: 'Right', when: { has: 'lock' }, ops: [] }] }),
    I('g1', { inGame: { effect: 'draw 2' } }),
    I('g2', { inGame: { window: 'roundEnd', effect: 'heal' }, when: { has: 'hurt' } }),
  ];
  it('a choice without an answer asks, with only the available options, and leaves the log alone', () => {
    const r = runBetween(list, emptyLog(), 's1');
    expect(r.ask).toEqual({ id: 'i3', text: 'printed i3', cite: 'p.12', options: [{ id: 'l', label: 'Left' }] });
    expect(r.log).toEqual(emptyLog());
  });
  it('with the answer every between-games instruction runs and is listed with its printed text', () => {
    const r = runBetween(list, emptyLog(), 's1', { i3: 'l' });
    expect([count(r.log, 'doom'), rewardTotal(r.log), setHas(r.log, 'path', 'left'), has(r.log, 'no')]).toEqual([2, 3, true, false]);
    expect(r.ran).toEqual([{ id: 'i1', text: 'printed i1', cite: 'p.12' }, { id: 'i3', text: 'printed i3', cite: 'p.12', chose: 'l' }]);
  });
  it('in-game instructions come by window', () => {
    expect(inGameAt(list, 'afterSetup', emptyLog()).map((i) => i.inGame?.effect)).toEqual(['draw 2']);
    expect(inGameAt(list, 'roundEnd', emptyLog())).toEqual([]);
    expect(inGameAt(list, 'roundEnd', record(emptyLog(), 'hurt')).length).toBe(1);
  });
  it('every-node instructions follow the node ones; checkGraph lists problems', () => {
    const g: CampaignGraph<string> = { ...choice, every: { setup: [I('e', {})] }, before: [I('b', { text: '' })], finale: { node: 'q' } };
    expect(instructions(g, 'a', 'setup').map((i) => i.id)).toEqual(['e']);
    expect(checkGraph(g)).toEqual(['unknown finale q', 'instruction b lacks printed text or citation']);
    expect(checkGraph(choice)).toEqual([]);
  });
});
