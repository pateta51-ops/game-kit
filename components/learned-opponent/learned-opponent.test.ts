import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createGame, type KernelPrompt } from '../engine-core/index';
import { DriverRng, runGames, type SimRecord } from '../sim-pool/index';
import { DUEL, INPUTS, MODEL, encodeEnd, type DuelState } from './fake/duel';
import { actorOf, Evaluator, Inputs, behind, blank, combos, deal, decide, expected, finalTarget, forward, fromWeights, newNet, predictorTarget, present, pretrain, readWeights, seatOrder, tdTrain, thermo, toWeights, trainSelfPlay, trainStep, writeWeights } from './index';

const dir = mkdtempSync(path.join(tmpdir(), 'learned-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const module = new URL('./fake/duel.ts', import.meta.url).href;

describe('encoder helpers', () => {
  it('codes counts as thermometers, keys as presence, seats self first, and the gap to the leader', () => {
    const L = new Inputs();
    const t = L.thermo('vp', 3);
    const p = L.presence('hand', ['a', 'b']);
    expect(L.names).toEqual(['vp>0', 'vp>1', 'vp>2', 'hand:a', 'hand:b']);
    const x = blank(L);
    thermo(x, t, 2);
    present(x, p, ['b']);
    expect([...x]).toEqual([1, 1, -1, -1, 1]);
    expect(() => present(x, p, ['z'])).toThrow(/unknown key/);
    expect(seatOrder(2, 4)).toEqual([2, 3, 0, 1]);
    expect(behind([3, 7, 5])).toEqual([4, 0, 2]);
  });
});

describe('network', () => {
  const names = INPUTS.names;
  it('gives the same output incrementally as in full, and sums to 1 over seats', () => {
    const net = newNet(names, 8, 2);
    const ev = new Evaluator(net);
    const r = new DriverRng('x');
    for (let k = 0; k < 5; k += 1) {
      const x = blank(INPUTS).map(() => (r.chance(0.5) ? 1 : -1));
      const a = forward(net, x);
      const b = ev.run(x);
      expect(Math.abs((a[0] as number) - (b[0] as number))).toBeLessThan(1e-9);
      expect((a[0] as number) + (a[1] as number)).toBeCloseTo(1);
    }
  });

  it('backprop lowers the error toward a target', () => {
    const net = newNet(names, 8, 2);
    const x = encodeEnd([9, 2], 0);
    const first = trainStep(net, x, [1, 0], 0.5);
    for (let i = 0; i < 50; i += 1) trainStep(net, x, [1, 0], 0.5);
    expect(trainStep(net, x, [1, 0], 0.5)).toBeLessThan(first / 4);
  });

  it('weight file round-trips, and refuses other input names', () => {
    const net = newNet(names, 4, 2);
    const file = path.join(dir, 'w.json');
    writeWeights(file, net);
    expect(readWeights(file, names).w1).toEqual(net.w1);
    expect(() => readWeights(file, [...names.slice(0, -1), 'other'])).toThrow(/differ from the encoder/);
    expect(() => fromWeights(toWeights(net), names.slice(1))).toThrow(/differ/);
  });

  it('targets: score softmax by margin, or win/lose', () => {
    const s = finalTarget([10, 5]);
    expect(s[0]).toBeGreaterThan(0.8);
    expect(finalTarget([4, 4], { target: 'win' })).toEqual([0.5, 0.5]);
    expect(finalTarget([4, 1], { target: 'win' })).toEqual([1, 0]);
  });
});

describe('determinization and the decision driver', () => {
  it('K222: the actor is the open prompt seat when the model has no actor', () => {
    const s = createGame(DUEL, { seed: 'k222' }, {}, {}).state;
    expect('actor' in MODEL).toBe(false);
    expect(actorOf(MODEL, s)).toBe(s.actor);
    expect(actorOf({ actor: () => 1 }, s)).toBe(1);
    expect(actorOf({}, { ...s, prompt: { ...(s.prompt as KernelPrompt), seat: '1' } })).toBe(1);
    expect(() => actorOf({}, { ...s, prompt: null })).toThrow(RangeError);
  });

  it('deals the unseen cards, the rest as the deck', () => {
    const [a = [], rest = []] = deal([1, 2, 3, 4, 5], [2], new DriverRng('d'));
    expect(a).toHaveLength(2);
    expect([...a, ...rest].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('HARD RULE: decides from the redacted view only - the same view with other hidden cards gives the same choice', () => {
    const net = newNet(INPUTS.names, 8, 2);
    const s = createGame(DUEL, { seed: 'v' }, {}, {}).state;
    const other = s.hands[1] as number[];
    const unseen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((c) => !s.hands.flat().includes(c));
    const swapped: DuelState = { ...s, hands: [s.hands[0] as number[], [...other.slice(0, 2), ...unseen]], prizes: [s.prizes[0] as number, ...[...s.prizes.slice(1)].reverse()] };
    expect(MODEL.view(swapped, 0)).toEqual(MODEL.view(s, 0));
    const actions = MODEL.legal(s);
    const a = decide(MODEL, net, MODEL.view(s, 0), 0, actions, { samples: 4 });
    const b = decide(MODEL, net, MODEL.view(swapped, 0), 0, actions, { samples: 4 });
    expect(b).toEqual(a);
    expect(decide(MODEL, net, MODEL.view(s, 0), 0, actions, { samples: 4, pick: 'pessimistic' }).values).toHaveLength(actions.length);
  });

  it('predictor helpers: combos by probability, expected value, search-score target', () => {
    const c = combos([[0.7, 0.3], [0.5, 0.5]], 0.2);
    expect(c.map((x) => x.picks)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]].slice(0, 2));
    const e = expected(2, c, (o, p) => (o === p[0] ? 1 : 0));
    expect(e[0]).toBeCloseTo(0.7);
    expect(e[1]).toBe(0);
    const t = predictorTarget([1, 0.5]);
    expect(t[0]).toBeGreaterThan(0.99);
    const neg = predictorTarget([-2, -1, -4]);
    expect(neg[1]).toBeGreaterThan(neg[0] as number);
    expect(neg[0]).toBeGreaterThan(neg[2] as number);
    const zero = predictorTarget([0, -0.5]);
    expect(zero[0]).toBeGreaterThan(zero[1] as number);
  });

  it('HARD RULE: the open prompt of another seat is redacted, and other prompts and hidden cards behind one view give one decision', () => {
    const net = newNet(INPUTS.names, 8, 2);
    const s = createGame(DUEL, { seed: 'p' }, {}, {}).state;
    const h0 = s.hands[0] as number[];
    const free = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((c) => !s.hands.flat().includes(c));
    const alt = [...free, ...h0].slice(0, 4);
    const other: DuelState = { ...s, hands: [alt, s.hands[1] as number[]], prompt: { ...(s.prompt as KernelPrompt), options: alt.map((c) => ({ id: String(c), enabled: true })) } };
    expect(other.prompt).not.toEqual(s.prompt);
    expect(MODEL.view(s, 1).pub.prompt?.options).toEqual([]);
    expect(JSON.stringify(MODEL.view(s, 1))).not.toContain(`"id":"${String(h0[0])}"`);
    expect(MODEL.view(other, 1)).toEqual(MODEL.view(s, 1));
    const play = (st: DuelState): DuelState => MODEL.apply(st, { kind: 'answer', promptId: (st.prompt as KernelPrompt).id, picks: [String(h0[3])] });
    const a = play({ ...s, hands: [[free[0] as number, ...h0.slice(1)], s.hands[1] as number[]] });
    const b = play(s);
    expect(a.hands[0]).not.toEqual(b.hands[0]);
    expect(MODEL.view(a, 1)).toEqual(MODEL.view(b, 1));
    const actions = MODEL.legal(b);
    expect(decide(MODEL, net, MODEL.view(a, 1), 1, actions, { samples: 4 })).toEqual(decide(MODEL, net, MODEL.view(b, 1), 1, actions, { samples: 4 }));
  });

  it('TD(lambda) trains every recorded state of a game', () => {
    const net = newNet(INPUTS.names, 8, 2);
    const err = tdTrain(net, [{ seat: 0, x: encodeEnd([1, 1], 0) }, { seat: 1, x: encodeEnd([1, 1], 1) }], [4, 1]);
    expect(err).toBeGreaterThan(0);
  });
});

describe('self-play training on the sim-pool', () => {
  it('TD self-play measurably beats random, and beats the pre-trained net, over the same seeded games', async () => {
    const file = path.join(dir, 'duel.json');
    const net = newNet(INPUTS.names, 16, 2);
    pretrain(net, 2000, (r) => {
      const scores = [r.int(11), r.int(11)];
      const seat = r.int(2);
      return { x: encodeEnd(scores, seat), scores, seat };
    });
    writeWeights(file, net);
    const vsRandom = async (): Promise<number> => {
      const specs = Array.from({ length: 200 }, (_, i) => ({ index: i, seed: `eval-${String(i)}`, driver: 'match', settings: { weights: file, seat: i % 2 } }));
      const recs = (await runGames({ module, specs }, 1)) as SimRecord<{ scores: number[] }>[];
      let share = 0;
      for (const r of recs) {
        const sc = r.summary?.scores as number[];
        const me = Number(r.settings?.seat);
        share += (sc[me] as number) > (sc[1 - me] as number) ? 1 : sc[0] === sc[1] ? 0.5 : 0;
      }
      return share / recs.length;
    };
    const before = await vsRandom();
    const errs: number[] = [];
    await trainSelfPlay({ module, file, names: INPUTS.names, generations: 4, games: 60, epsilon: 0.1, noisyGenerations: 1, onGeneration: (_g, e) => errs.push(e) });
    expect(readWeights(file, INPUTS.names).trained).toBe(240);
    expect(errs).toHaveLength(4);
    const after = await vsRandom();
    expect(after).toBeGreaterThan(0.62);
    expect(after).toBeGreaterThan(before + 0.05);
  });
});
