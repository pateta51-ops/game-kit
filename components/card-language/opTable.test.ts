import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EngineBugError } from '../engine-core/index.ts';
import { effectOf, optional, posInt } from './index.ts';
import { describeOps, runOp, validateOps, type EnginePort, type OpTable } from './opTable.ts';

// A tiny invented game on its own engine (tests only; the kit holds no game ops).
interface State { coins: number; hand: string[]; deck: string[] }
interface Port extends EnginePort<State> { readonly drawOne: () => void }
type Op =
  | { readonly op: 'gainCoins'; readonly amount: number }
  | { readonly op: 'draw'; readonly count?: number }
  | { readonly op: 'twice'; readonly then: readonly Op[] };

const OPS: OpTable<Port, Op> = {
  gainCoins: { fields: { amount: posInt }, run: (p, o) => void (p.state.coins += o.amount), text: (o) => `Gain ${String(o.amount)} coin${o.amount === 1 ? '' : 's'}.` },
  draw: {
    fields: { count: optional(posInt) },
    run: (p, o) => { for (let i = 0; i < (o.count ?? 1); i++) p.drawOne(); },
    text: (o) => ((o.count ?? 1) === 1 ? 'Draw a card.' : `Draw ${String(o.count)} cards.`),
  },
  twice: {
    fields: { then: effectOf(() => OPS) },
    run: (p, o) => { for (let i = 0; i < 2; i++) for (const x of o.then) runOp(OPS, p, x); },
    text: (o) => `Twice: ${describeOps(OPS, o.then)}`,
  },
};

const portOf = (s: State): Port => ({ state: s, drawOne: () => { const c = s.deck.shift(); if (c !== undefined) s.hand.push(c); } });
const fresh = (): State => ({ coins: 0, hand: [], deck: ['a', 'b', 'c', 'd', 'e'] });
const NUM: Record<string, number> = { a: 1 };
const numberIn = (text: string, noun: string): number => {
  const m = new RegExp(`(\\d+|a) ${noun}`).exec(text);
  if (!m?.[1]) throw new Error(`no ${noun} in "${text}"`);
  return NUM[m[1]] ?? Number(m[1]);
};

describe('op table (K507)', () => {
  it.each<Op>([{ op: 'gainCoins', amount: 1 }, { op: 'gainCoins', amount: 3 }, { op: 'draw' }, { op: 'draw', count: 2 }])('text matches run: %j', (op) => {
    const s = fresh();
    runOp(OPS, portOf(s), op);
    const text = describeOps(OPS, [op]);
    if (op.op === 'gainCoins') expect(s.coins).toBe(numberIn(text, 'coin'));
    else expect(s.hand.length).toBe(numberIn(text, 'card'));
  });

  it('a nested op runs and reads through the same rows', () => {
    const s = fresh();
    const op: Op = { op: 'twice', then: [{ op: 'gainCoins', amount: 2 }, { op: 'draw' }] };
    runOp(OPS, portOf(s), op);
    expect(describeOps(OPS, [op])).toBe('Twice: Gain 2 coins. Draw a card.');
    expect([s.coins, s.hand.length]).toEqual([4, 2]);
  });

  it('runOp throws for an op not in the table', () => {
    expect(() => runOp(OPS, portOf(fresh()), { op: 'fly' } as unknown as Op)).toThrow(EngineBugError);
  });

  it('validateOps passes good cards', () => {
    expect(validateOps(OPS, { purse: [{ op: 'gainCoins', amount: 2 }, { op: 'draw' }] })).toEqual([]);
  });

  it('validateOps reports each kind of error per card and op', () => {
    const BROKEN: OpTable<Port, { readonly op: 'shout'; readonly n: number }> = {
      shout: { fields: { n: posInt }, run: () => undefined, text: (o) => { if (o.n > 5) throw new Error('too loud'); return o.n === 5 ? ' ' : 'Shout.'; } },
    };
    const p = validateOps({ ...OPS, ...BROKEN }, {
      a: [{ op: 'fly' }, 7],
      b: [{ op: 'gainCoins' }, { op: 'gainCoins', amount: 1, colour: 'red' }, { op: 'gainCoins', amount: 0 }],
      c: [{ op: 'shout', n: 9 }, { op: 'shout', n: 5 }],
    });
    expect(p.map((x) => [x.card, x.index, x.op, x.kind])).toEqual([
      ['a', 0, 'fly', 'unknown-op'],
      ['a', 1, '', 'not-an-op'],
      ['b', 0, 'gainCoins', 'missing-field'],
      ['b', 1, 'gainCoins', 'extra-field'],
      ['b', 2, 'gainCoins', 'bad-field'],
      ['c', 0, 'shout', 'text'],
      ['c', 1, 'shout', 'text'],
    ]);
    expect(p.map((x) => x.detail)).toEqual(['unknown op "fly"', 'an op must be an object', 'amount', 'colour', 'amount must be a positive integer', 'too loud', 'empty text']);
  });

  it('the README example is this file\'s example', () => {
    const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8');
    const block = /## Op table \(for games on their own engine\)[\s\S]*?```ts\r?\n([\s\S]*?)```/.exec(readme)?.[1];
    const mine = /\/\/ README start\r?\n([\s\S]*?)\/\/ README end/.exec(fs.readFileSync(new URL('./opTable.test.ts', import.meta.url), 'utf8'))?.[1];
    expect(mine).toBeDefined();
    expect(block?.replace(/\r/g, '').replace(/^import .*\n/gm, '')).toBe(mine?.replace(/\r/g, ''));
  });
});

// README start
type Ex = { readonly op: 'gain'; readonly coins: number };
interface ExPort extends EnginePort<{ coins: number }> { readonly log: (s: string) => void }
const EX: OpTable<ExPort, Ex> = {
  gain: { fields: { coins: posInt }, run: (p, o) => void (p.state.coins += o.coins), text: (o) => `Gain ${String(o.coins)} coins.` },
};
const exState = { coins: 0 };
runOp(EX, { state: exState, log: () => undefined }, { op: 'gain', coins: 2 }) // exState.coins === 2
console.log(describeOps(EX, [{ op: 'gain', coins: 2 }])) // "Gain 2 coins."
console.log(validateOps(EX, { purse: [{ op: 'gain' }, { op: 'fly' }] })) // missing-field coins, unknown-op fly
// README end
