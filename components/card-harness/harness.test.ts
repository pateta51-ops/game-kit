import { describe, expect, it } from 'vitest';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clauseIds, conforms, createProbe, Delivery, describeCheck, expectResolved, inventory, renderRecords, report, runInventory, Scenario, scenarioLiteral, rulingGroups, testFiles, traceAbilities, type DeliveryGame, type Same } from './index.ts';
import { keysOf, literalsOf } from './literals.ts';
import { DICE, DICE_GAME, PROBE, type DiceEvent, type Dice, type DiceState, type Note } from './fake/dice.ts';
import { applyAction } from '../engine-core/index.ts';
import { diffPaths, roundTripCards } from './roundtrip.ts';

describe('K124 cast and K114 round trip', () => {
  it('cast returns the open prompt of that kind and names the kind otherwise', () => {
    const base = new Scenario(DICE_GAME);
    const s = { ...base.s, prompt: { id: 1, options: [], min: 0, max: 0, kind: 'pick' } };
    const sc = new Scenario(DICE_GAME, { from: { state: s, events: [] } });
    expect((sc.cast('pick') as { id: number }).id).toBe(1);
    expect(() => sc.cast('order')).toThrow(/Expected a order prompt, found kind pick/);
    expect(() => base.cast('pick')).toThrow(/found none/);
  });
  it('every card survives a JSON round trip and plays the same from the copy', () => {
    const entries = ['twin', 'ladder', 'plain'].map((card) => ({ card, where: 'hand' as const, task: (id: string) => ({ kind: 'play', card: id }) }));
    expect(roundTripCards(DICE_GAME, entries)).toEqual([]);
  });
  it('names the path of a non-plain value', () => {
    expect(diffPaths({ a: new Set([1]) }, { a: {} })).toEqual(['$.a']);
    expect(diffPaths({ a: undefined }, {})).toEqual(['$.a']);
    const game = { ...DICE_GAME, start: () => ({ ...DICE_GAME.start(), when: new Date(0) }) };
    expect(roundTripCards(game, [{ card: 'twin', where: 'hand' }])).toEqual(['twin: state is not plain JSON at $.when']);
  });
});

describe('scenario', () => {
  it('builds a position, plays a card through the rules and records events', () => {
    const sc = new Scenario(DICE_GAME).set((s) => void (s.dice = [2, 2, 5]));
    const [twin] = sc.put('hand', 'twin');
    sc.run({ kind: 'play', card: twin as string });
    expect(sc.s.score).toBe(2);
    expect(sc.s.table).toEqual([twin]);
    expect(sc.events.map((e) => e.type)).toEqual(['scored']);
    expect(sc.prompt).toBeNull();
  });
  it('asks when two cards are legal and records the probe', () => {
    const sc = new Scenario(DICE_GAME).set((s) => void (s.dice = [1, 2, 3]));
    const [ladder, a, b] = sc.put('hand', 'ladder', 'plain', 'twin');
    sc.run({ kind: 'play', card: ladder as string });
    expect(sc.options()).toEqual([a, b]);
    expect(sc.offered(b as string)).toBe(true);
    sc.answer(b as string);
    expect(sc.s.hand).toEqual([a]);
    expect(sc.notes).toEqual([{ how: 'asked', legal: [a, b] }]);
    expect(() => sc.answer('x')).toThrow();
  });
  it('sees a forced choice and the before/after delta', () => {
    const sc = new Scenario(DICE_GAME).set((s) => void (s.dice = [4, 5, 6]));
    const [ladder, a] = sc.put('hand', 'ladder', 'plain');
    const d = sc.observe((s) => s.score, (x) => x.run({ kind: 'play', card: ladder as string }));
    expect(d).toEqual({ before: 0, after: 3 });
    expect(sc.notes).toEqual([{ how: 'forced', legal: [a], took: a }]);
    expect(PROBE.listening).toBe(false);
  });
  it('refuses an illegal position unless told not to check', () => {
    const bad = new Scenario(DICE_GAME).set((s) => void (s.score = -1));
    expect(() => bad.run({ kind: 'play' })).toThrow(/D-01/);
    expect(() => new Scenario(DICE_GAME, { validate: false }).set((s) => void (s.score = -1)).run({ kind: 'play' })).not.toThrow();
  });
  it('probe: nested traces put the outer listener back', () => {
    const p = createProbe<number>();
    const r = p.trace(() => {
      p.note(1);
      const inner = p.trace(() => p.note(2));
      p.note(3);
      return inner.notes;
    });
    expect(r).toEqual({ result: [2], notes: [1, 3] });
  });
});

describe('strict mode, scripted answers, checks and teardown', () => {
  const setup = (strict: boolean) => {
    const sc = new Scenario(DICE_GAME, { strict }).set((s) => void (s.dice = [1, 2, 3]));
    const ids = sc.put('hand', 'ladder', 'plain', 'twin');
    return { sc, ids: ids as [string, string, string] };
  };
  it('a scripted answer is used when the prompt opens', () => {
    const { sc, ids } = setup(true);
    sc.script([ids[2]]).run({ kind: 'play', card: ids[0] }).done();
    expect(sc.s.hand).toEqual([ids[1]]);
  });
  it('fails on an unanswered prompt in strict mode only', () => {
    const { sc, ids } = setup(true);
    sc.run({ kind: 'play', card: ids[0] });
    expect(() => sc.done()).toThrow(/^Unanswered prompt \d+: options plain#2, twin#3$/);
    const lax = setup(false);
    lax.sc.run({ kind: 'play', card: lax.ids[0] });
    expect(() => lax.sc.done()).not.toThrow();
  });
  it('fails on a scripted answer left over', () => {
    const { sc, ids } = setup(true);
    sc.script([ids[1]], ['x']).run({ kind: 'play', card: ids[0] });
    expect(() => sc.done()).toThrow('Unused scripted answers: [x]');
  });
  it('strict answer with no prompt open says so', () => {
    const { sc } = setup(true);
    expect(() => sc.answer('a')).toThrow('Answer [a] given but no prompt is open');
  });
  it('a mid-run check names its label and step', () => {
    const { sc, ids } = setup(false);
    sc.run({ kind: 'play', card: ids[1] }).check('scored', (s) => s.score === 1);
    expect(() => sc.check('none', (s) => s.score === 5)).toThrow('Check "none" failed after step 1 (run play)');
    expect(() => sc.check('why', () => 'bad')).toThrow('Check "why" failed after step 1 (run play): bad');
  });
  it('fails on a duplicate effect at teardown', () => {
    const g = { ...DICE_GAME, effects: (s: DiceState) => s.table.map(() => ({ gain: 1 })) };
    const sc = new Scenario(g);
    sc.put('table', 'plain', 'plain');
    expect(() => sc.done()).toThrow('Duplicate effect: {"gain":1}');
    expect(() => new Scenario(g).done()).not.toThrow();
  });
});

describe('delivery', () => {
  // A stand-in session: with `auto` on, the settings answer every prompt with its first enabled option.
  const session = (auto: boolean): DeliveryGame<DiceState, Dice['prompt'], Note, string> => {
    let s: DiceState;
    const go = (picks: readonly string[]): void => {
      s = applyAction(DICE, s, { kind: 'answer', promptId: s.prompt?.id ?? -1, picks }, DICE_GAME.content).state;
    };
    return {
      load: (x) => void (s = x),
      prompt: () => s.prompt,
      dispatch(picks) {
        try {
          go(picks);
        } catch (e) {
          return { ok: false, error: String(e), autos: [] };
        }
        const autos: string[] = [];
        while (auto && s.prompt !== null) {
          const id = s.prompt.options.find((o) => o.enabled)?.id as string;
          autos.push(id);
          go([id]);
        }
        return { ok: true, autos };
      },
      probe: PROBE,
      silentNote: (n) => (n.how === 'forced' ? `forced ${n.took ?? ''}` : null),
      silentAuto: (a) => `auto ${a}`,
    };
  };
  const position = (...cards: string[]): DiceState => {
    const sc = new Scenario(DICE_GAME);
    const ids = sc.put('hand', ...cards);
    return sc.run(...ids.filter((i) => i.startsWith('ladder')).map((card) => ({ kind: 'play', card }))).s;
  };
  it('reaches the player: no silent choice', () => {
    const d = new Delivery(session(false)).load(position('ladder', 'plain', 'twin'));
    expect(d.prompt?.options).toHaveLength(2);
    expect(d.answer('nope').ok).toBe(false);
    expect(d.answer('twin#3').ok).toBe(true);
    expect(d.prompt).toBeNull();
    expect(d.silentChoices()).toEqual([]);
  });
  it('lists an engine choice nobody was asked', () => {
    const d = new Delivery(session(false)).load(position('ladder', 'ladder', 'plain', 'twin'));
    d.answer('plain#3');
    expect(d.log[0]?.notes).toEqual([{ how: 'forced', legal: ['twin#4'], took: 'twin#4' }]);
    expect(d.silentChoices()).toEqual([{ kind: 'engine', what: 'forced twin#4' }]);
  });
  it('lists an answer the settings gave', () => {
    const d = new Delivery(session(true)).load(position('ladder', 'ladder', 'plain', 'plain', 'twin'));
    d.answer('plain#3');
    expect(d.silentChoices()).toEqual([{ kind: 'settings', what: 'auto plain#4' }]);
  });
});

describe('inventory', () => {
  const tests = [
    { path: 'tests/a.test.ts', text: "it('SC-01 pair scores', () => { roll('pair') })\nit('ladder card', () => {})" },
    { path: 'tests/b.test.ts', text: "it('runs formula', () => { formula: 'runs' })" },
  ];
  const input = {
    pieces: [
      { kind: 'pattern', id: 'pair' },
      { kind: 'pattern', id: 'run', cards: ['ladder'] },
      { kind: 'pattern', id: 'triple' },
      { kind: 'formula', id: 'runs', cite: ["formula: 'runs'"] },
    ],
    clauses: [{ id: 'CL-1', cards: ['twin'] }],
    tests,
    baseline: ['pattern:triple'],
  };
  it('reports which test cites which, from data of any shape', () => {
    const inv = inventory(input);
    const by = Object.fromEntries(inv.rows.map((r) => [r.key, r]));
    expect(by['pattern:pair']?.direct).toEqual(['tests/a.test.ts › SC-01 pair scores']);
    expect(by['pattern:run']?.direct).toEqual([]);
    expect(by['pattern:run']?.via).toEqual(['tests/a.test.ts']);
    expect(by['formula:runs']?.direct).toEqual(['tests/b.test.ts']);
    expect(inv.uncited).toEqual(['clause:CL-1']);
    expect(inv.staleBaseline).toEqual([]);
    expect(inventory({ ...input, directOnly: true }).uncited).toEqual(['pattern:run', 'clause:CL-1']);
    expect(() => inventory({ ...input, pieces: [...input.pieces, { kind: 'pattern', id: 'pair' }] })).toThrow(/twice/);
  });
  it('writes, then fails when stale, uncited or the baseline is out of date', () => {
    const files = new Map<string, string>();
    const log: string[] = [];
    const io = { read: (p: string) => files.get(p) ?? null, write: (p: string, t: string) => void files.set(p, t), log: (l: string) => void log.push(l) };
    const ok = { ...input, clauses: [{ id: 'CL-1', cards: ['ladder'] }] };
    expect(runInventory(ok, 'inv.md', false, io)).toBe(0);
    expect(runInventory(ok, 'inv.md', true, io)).toBe(0);
    expect(files.get('inv.md')).toContain('| pattern | 3 | 1 | 1 | 1 | 1 | 1 |');
    expect(runInventory({ ...ok, tests: [...tests, { path: 'tests/c.test.ts', text: "it('triple', () => {})" }] }, 'inv.md', true, io)).toBe(1);
    expect(log.some((l) => l.includes('stale'))).toBe(true);
    expect(log.some((l) => l.includes('baseline lists pattern:triple'))).toBe(true);
    expect(runInventory(input, 'x.md', false, io)).toBe(1);
  });
  it('owns printed lines, routes record verbs, builds clause ids (K83, K26)', () => {
    const base = { pieces: [], tests: [] };
    const a = inventory({ ...base, lines: [{ id: 'l1', records: ['r1'] }, { id: 'l2', records: [] }, { id: 'l3', records: [] }], openLines: ['l3', 'l1', 'gone'], records: [{ id: 'r1', verb: 'gain' }, { id: 'r2', verb: 'zap' }], routes: ['gain'] });
    expect([a.unowned, a.staleOpen, a.unrouted]).toEqual([['l2'], ['gone', 'l1'], ['r2:zap']]);
    const io = { read: () => null, write: () => undefined, log: () => undefined };
    expect(runInventory({ ...base, lines: [{ id: 'l2', records: [] }] }, 'x.md', false, io)).toBe(1);
    expect(runInventory({ ...base, lines: [{ id: 'l2', records: ['r'] }], records: [{ id: 'r', verb: 'gain' }], routes: ['gain'] }, 'x.md', false, io)).toBe(0);
    expect(clauseIds([{ kind: 'on', text: 'Gain 2 coins.' }, { kind: 'on', text: 'Gain 3 coins.' }, { kind: 'on', text: 'Draw a card.' }, { kind: 'end', text: 'Gain 2 coins.' }, { kind: 'on', text: 'Draw' }, { kind: 'on', text: 'Draw' }]))
      .toEqual(['on-gain-2', 'on-gain-3', 'on-draw-a', 'end-gain', 'on-draw', 'on-draw']);
  });
  it('collects test files', () => {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    expect(testFiles(root, ['card-harness']).map((f) => f.path)).toContain('card-harness/harness.test.ts');
  });
});

describe('card-language checks', () => {
  const describeEnc = (e: { n: number; icon: string }): string => `Gain ${String(e.n)} [${e.icon}].`;
  it('describe-check: generated reading equals the printed text', () => {
    const cards = [
      { id: 'a', printed: 'Gain 2 [RUN].', encoding: { n: 2, icon: 'RUN' } },
      { id: 'b', printed: 'Gain 3 [OUT].', encoding: { n: 3, icon: 'RUN' } },
      { id: 'c', printed: 'x', encoding: { n: -1, icon: 'RUN' } },
    ];
    const errors = describeCheck(cards, describeEnc, (e) => (e.n < 0 ? ['n is negative'] : []));
    expect(errors).toHaveLength(4);
    expect(errors[0]).toContain('b: the generated reading differs');
    expect(errors[1]).toBe('b: printed [OUT] is not in the generated reading');
    expect(errors[3]).toBe('c: n is negative');
    const log: string[] = [];
    expect(report('describe', errors, (l) => log.push(l), 3)).toBe(1);
    expect(log.at(-1)).toBe('describe: 4 error(s); 3 checked');
    expect(report('describe', [], () => undefined)).toBe(0);
  });
  it('conformance: types match at compile time', () => {
    conforms<Same<{ a: 1 }, { a: 1 }>>();
    // @ts-expect-error the types differ
    conforms<Same<{ a: 1 }, { a: 2 }>>();
    expect(true).toBe(true);
  });
  it('reads the keys of an untagged union (K392)', () => {
    const f = fileURLToPath(new URL('./fake/lang.ts', import.meta.url));
    const want = ['discard', 'draw', 'gain', 'hit', 'miss'];
    expect(literalsOf(f, 'Effect', { keys: true })).toEqual(want);
    expect(keysOf(f, 'Effect')).toEqual(want);
    expect(() => keysOf(f, 'Nope')).toThrow();
  });
  it('K397 keysOf skips primitive members and can return only the first key', () => {
    const f = fileURLToPath(new URL('./fake/lang.ts', import.meta.url));
    expect(keysOf(f, 'Mixed')).toEqual(['gain', 'hit', 'miss', 'pa', 'pb']);
    expect(keysOf(f, 'Mixed', { first: true })).toEqual(['gain', 'hit', 'pa']);
    expect(literalsOf(f, 'Effect', { keys: 'first' })).toEqual(['discard', 'draw', 'gain', 'hit']);
  });
  it('reads pieces from the game types', () => {
    const f = fileURLToPath(new URL('./fake/lang.ts', import.meta.url));
    expect(literalsOf(f, 'Formula')).toEqual(['hits', 'outs', 'runs']);
    expect(literalsOf(f, 'Step', 'op')).toEqual(['gain', 'reroll', 'roll']);
    expect(literalsOf(f, 'Step', 'kind')).toEqual(['if']);
    expect(() => literalsOf(f, 'Nope')).toThrow();
  });
});

describe('index entries and strict citation', () => {
  it('literals/index exports literalsOf', async () => {
    expect((await import('./literals/index.ts')).literalsOf).toBe(literalsOf);
  });
  it('a scenario starts from a state and its events', () => {
    const a = new Scenario(DICE_GAME).set((s) => void (s.dice = [2, 2, 5])).run({ kind: 'play' });
    const b = new Scenario(DICE_GAME, { from: { state: a.s, events: a.events } });
    expect(b.events).toEqual(a.events);
    expect(b.s).toEqual(a.s);
  });
  it('counts an id only in a test title, not a comment', () => {
    const tests = [{ path: 'a.test.ts', text: "// pair is covered here\nit('other', () => {})" }];
    expect(inventory({ titleOnly: true, pieces: [{ kind: 'p', id: 'pair' }], clauses: [{ id: 'CL-9', cards: [] }], tests }).uncited).toEqual(['p:pair', 'clause:CL-9']);
    const t2 = [{ path: 'a.test.ts', text: "it('pair works', () => {})" }];
    expect(inventory({ titleOnly: true, pieces: [{ kind: 'p', id: 'pair' }], tests: t2 }).uncited).toEqual([]);
  });
});

describe('ability-fired trace (K98)', () => {
  it('a card looked up but not run fails expectResolved; a run card passes', () => {
    const t = traceAbilities(Object.freeze({ ...DICE_GAME.content }), 'gain');
    const sc = new Scenario({ ...DICE_GAME, content: t.registry }).set((s) => void (s.dice = [1, 2, 3]));
    const [twin] = sc.put('hand', 'twin');
    sc.run({ kind: 'play', card: twin as string });
    expect(sc.s.score).toBe(0);
    expect(t.considered.has('twin')).toBe(true);
    expect(() => expectResolved(t, 'twin', 'ladder')).toThrow('Not resolved: twin (looked up, not run), ladder (never looked up)');
    t.clear();
    sc.set((s) => void (s.dice = [2, 2, 5]));
    const [twin2] = sc.put('hand', 'twin');
    sc.run({ kind: 'play', card: twin2 as string });
    expect(() => expectResolved(t, 'twin')).not.toThrow();
    expect([...t.resolved]).toEqual(['twin']);
  });
  it('takes only a record of objects by id (an array or Map would break behind the copy)', () => {
    // @ts-expect-error an array is not a record by id
    expect(() => traceAbilities([{ id: 'a' }])).not.toThrow();
    // @ts-expect-error a Map is not a record by id
    expect(() => traceAbilities(new Map([['a', {}]]))).not.toThrow();
    expect(traceAbilities({ a: { effects: [1] } }).registry.a?.effects).toEqual([1]);
  });
});

describe('K102 helpers', () => {
  const setup = () => {
    const sc = new Scenario(DICE_GAME).set((s) => void (s.dice = [1, 2, 3]));
    return { sc, ids: sc.put('hand', 'ladder', 'plain', 'twin') as [string, string, string] };
  };
  it('a refused answer prints the open prompt and its choices', () => {
    const { sc, ids } = setup();
    sc.run({ kind: 'play', card: ids[0] });
    expect(() => sc.answer('x')).toThrow(/refused[\s\S]*open prompt \d+[\s\S]*offered: plain#2, twin#3/);
  });
  it('noPrompt fails on a left-open prompt', () => {
    const { sc, ids } = setup();
    expect(() => sc.noPrompt()).not.toThrow();
    sc.run({ kind: 'play', card: ids[0] });
    expect(() => sc.noPrompt()).toThrow(/left open[\s\S]*offered: plain#2, twin#3/);
  });
  it('changed checks several deltas and lists each one off', () => {
    const { sc, ids } = setup();
    const hand = (s: DiceState): number => s.hand.length;
    sc.changed([['score', (s) => s.score, 1], ['hand', hand, -1]], (x) => x.run({ kind: 'play', card: ids[1] }));
    expect(() => sc.changed([['score', (s) => s.score, 5], ['hand', hand, 0]], () => undefined)).toThrow(/score: 1 -> 1, wanted \+5/);
  });
  it('literal gives a { from } source that starts the same position', () => {
    const { sc } = setup();
    const lit = sc.literal();
    expect(lit.startsWith('{ from: { state: {')).toBe(true);
    const json = lit.slice('{ from: { state: '.length, lit.lastIndexOf(', events:'));
    const from = { state: JSON.parse(json) as DiceState, events: [] as DiceEvent[] };
    expect(new Scenario(DICE_GAME, { from }).s).toEqual(sc.s);
    expect(scenarioLiteral({ a: 1 })).toContain('"a": 1');
  });
  it('withRewind runs a branch and puts the position back', () => {
    const { sc, ids } = setup();
    const n = sc.withRewind((x) => x.run({ kind: 'play', card: ids[1] }).s.score);
    expect(n).toBe(1);
    expect(sc.s.score).toBe(0);
    expect(sc.history).toHaveLength(0);
    expect(sc.s.hand).toHaveLength(3);
  });
  it('rulingGroups names the source in the group', () => {
    const names: string[] = [];
    const { errata, faq } = rulingGroups((n) => void names.push(n));
    errata('FAQ 1.2', () => undefined);
    faq('Q7', () => undefined);
    expect(names).toEqual(['errata: FAQ 1.2', 'faq: Q7']);
  });
});

describe('record renderer (K78)', () => {
  type Rec = { id?: string; kind: string; line?: string | string[]; n?: number; who?: string; then?: Rec[]; flag?: string };
  const templates = {
    gain: (r: Rec) => `gain ${String(r.n)}`,
    draw: (r: Rec, say: (p: unknown) => string) => `${r.who ?? 'you'} draw ${String(r.n)}, then ${say(r.then)}`,
  };
  const lines = [
    { id: 'a:1', text: 'Draw 2 cards, then gain 1.' },
    { id: 'a:2', text: 'Gain 3.' },
    { id: 'a:3', text: 'Immune.', open: true },
    { id: 'a:4', text: 'Gain 1.' },
  ];
  it('K78: renders each record in English under its printed line, with render gaps marked', () => {
    const records: Rec[] = [
      { id: 'r1', kind: 'draw', line: 'a:1', n: 2, then: [{ kind: 'gain', n: 1 }, { kind: 'shuffle' }] },
      { id: 'r2', kind: 'gain', line: ['a:2', 'a:4'], n: 3, flag: 'once' },
      { id: 'r3', kind: 'gain', line: 'z:9', n: 1 },
    ];
    const out = renderRecords({ lines, records, templates, note: (r) => (r.id === 'r1' ? 'offered while barred: no' : undefined) });
    expect(out.text).toBe(
      [
        'a:1 | Draw 2 cards, then gain 1.',
        '  r1: you draw 2, then gain 1; [render-gap shuffle: {"kind":"shuffle"}]',
        '    note: offered while barred: no',
        'a:2 | Gain 3.',
        '  r2: gain 3 [also {"flag":"once"}]',
        'a:3 | Immune.',
        '  (open: no record yet)',
        'a:4 | Gain 1.',
        '  r2: gain 3 [also {"flag":"once"}]',
        'Records naming no printed line',
        '  r3: gain 1',
        '',
      ].join('\n'),
    );
    expect(out.lines[0]?.readings[0]?.gaps).toEqual(['shuffle']);
    expect(out.lines[1]?.readings[0]?.gaps).toEqual(['gain.flag']);
    expect(out.stray.map((r) => r.record)).toEqual(['r3']);
  });
  it('K78: a line with no record says so', () => {
    expect(renderRecords({ lines: [{ id: 'b:1', text: 'Gain 1.' }], records: [] as Rec[], templates }).text).toBe('b:1 | Gain 1.\n  (no record)\n');
  });
});
