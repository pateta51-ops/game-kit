import { describe, expect, it } from 'vitest';
import { kernelPort, type Draft } from '../engine-core/index.ts';
import { Scenario, type ScenarioPort } from './index.ts';
import { DICE, DICE_GAME, PROBE, type Dice, type Note, type Where } from './fake/dice.ts';

// K390: a game with its own engine (no engine-core): a pile of cards worth points, a queue of tasks, string prompt ids
interface Own {
  hand: string[];
  pile: string[];
  total: number;
  next: number;
  queue: string[];
  ask: { id: string; cards: string[] } | null;
  log: { type: string; card?: string }[];
}
interface OwnTypes {
  readonly state: Own;
  readonly prompt: { readonly id: string; readonly kind: 'pick'; readonly options: readonly { readonly id: string; readonly enabled: boolean; readonly why?: string }[] };
  readonly event: { type: string; card?: string };
  readonly task: string;
  readonly content: Readonly<Record<string, number>>;
}
const VALUES: OwnTypes['content'] = { one: 1, two: 2 };
const settle = (s: Own): Own => {
  const n = structuredClone(s);
  while (n.ask === null && n.queue.length > 0) {
    const t = n.queue.shift();
    if (t === 'pick') {
      if (n.hand.length === 0) n.log.push({ type: 'empty' });
      else n.ask = { id: `p${String(n.next++)}`, cards: [...n.hand] };
    }
  }
  return n;
};
const OWN: ScenarioPort<OwnTypes, 'hand'> = {
  content: VALUES,
  start: () => ({ hand: [], pile: [], total: 0, next: 1, queue: [], ask: null, log: [] }),
  apply(s, a) {
    if (s.ask === null || a.promptId !== s.ask.id) return new Error('no such prompt');
    const card = a.picks[0] ?? '';
    if (!s.ask.cards.includes(card)) return new Error(`not offered: ${card}`);
    if (s.total >= 3 && card.startsWith('two')) return new Error(`disabled: ${card}`);
    const n = structuredClone(s);
    n.ask = null;
    n.hand = n.hand.filter((c) => c !== card);
    n.pile.push(card);
    n.total += VALUES[card.split('#')[0] ?? ''] ?? 0;
    n.log.push({ type: 'played', card });
    return n;
  },
  settle,
  prompt: (s) =>
    s.ask === null ? null : { id: s.ask.id, kind: 'pick', options: s.ask.cards.map((id) => (s.total >= 3 && id.startsWith('two') ? { id, enabled: false, why: 'too much' } : { id, enabled: true })) },
  events: (s) => s.log,
  invariants: (s) => (s.total < 0 ? [{ id: 'O-01', message: 'negative total' }] : []),
  put(s: Draft<Own>, card) {
    const id = `${card}#${String(s.next++)}`;
    s.hand.push(id);
    return id;
  },
  push: (s, tasks) => void s.queue.unshift(...tasks),
};

describe('K390 Scenario over an engine port', () => {
  it('put, set, run, answer, options and events on a game with its own engine', () => {
    const sc = new Scenario(OWN, { strict: true });
    const [a, b] = sc.put('hand', 'one', 'two');
    sc.set((s) => void (s.total = 2)).run('pick');
    expect(sc.prompt?.id).toBe('p3');
    expect(sc.options()).toEqual([a, b]);
    sc.answer(a as string);
    expect(sc.s.total).toBe(3);
    sc.run('pick');
    expect(sc.options()).toEqual([]);
    expect(sc.open()).toContain('too much');
    expect(() => sc.answer(b as string)).toThrow(/refused: disabled/);
    sc.set((s) => void (s.total = 0)).answer(b as string).run('pick').done();
    expect(sc.events).toEqual([{ type: 'played', card: a }, { type: 'played', card: b }, { type: 'empty' }]);
    expect(sc.history.map((h) => h.what)).toEqual(['run pick', 'answer one#1', 'run pick', 'answer two#2', 'run pick']);
  });
  it('script and cast work through the port', () => {
    const sc = new Scenario(OWN);
    const [a] = sc.put('hand', 'one');
    sc.script([a as string]).run('pick').noPrompt();
    expect(sc.s.pile).toEqual([a]);
    sc.put('hand', 'two');
    expect(sc.run('pick').cast('pick').id).toBe('p4');
  });
  it('the port invariants run on the built position', () => {
    expect(() => new Scenario(OWN).set((s) => void (s.total = -1)).run()).toThrow(/O-01: negative total/);
    const noPush = Object.fromEntries(Object.entries(OWN).filter(([k]) => k !== 'push')) as unknown as ScenarioPort<OwnTypes, 'hand'>;
    expect(() => new Scenario(noPush).run('pick')).toThrow(/no push/);
  });
  it('the kernel fake gives the same results through GameRules and through kernelPort', () => {
    const port: ScenarioPort<Dice, Where, Note> = { ...kernelPort(DICE, DICE_GAME.content, { start: () => DICE_GAME.start(), put: (s, c, w) => DICE_GAME.put(s, c, w) }), probe: PROBE };
    const play = (sc: Scenario<Dice, Where, Note>) => {
      sc.set((s) => void (s.dice = [1, 2, 3]));
      const [ladder, a] = sc.put('hand', 'ladder', 'plain', 'twin');
      sc.run({ kind: 'play', card: ladder as string });
      const offered = sc.options();
      sc.answer(a as string);
      return { offered, s: sc.s, events: sc.events, notes: sc.notes, history: sc.history.map((h) => [h.what, h.prompt, h.events]) };
    };
    const viaRules = play(new Scenario(DICE_GAME));
    expect(play(new Scenario(port))).toEqual(viaRules);
  });
});
