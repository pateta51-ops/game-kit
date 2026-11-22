import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cardsCheck, cardsCheckMain, describeCheck, knownCheck, knownGate, parseKnown, recordsHash, runInventory, screenMain, writeKnown, type CardRecord, type CardsCheckInput, type Catalogue, type KnownFindings, type KnownIo, type RecordIo } from './index.ts';

// K650: one known-findings list: an owner per line, new and stale lines fail, a closed owner fails, a separate write command, a release mode.
const mem = (files: Record<string, string>) => {
  const writes: [string, string][] = [];
  const io: KnownIo = { read: (p) => files[p] ?? null, write: (p, t) => { writes.push([p, t]); files[p] = t; } };
  return { io, writes, files };
};
const gate = (found: string[], k: Omit<KnownFindings, 'io'>, files: Record<string, string>) => {
  const m = mem(files), log: string[] = [];
  return { code: knownGate('check', found, { ...k, io: m.io }, (l) => log.push(l)), log, writes: m.writes, files: m.files };
};

describe('K650 known findings', () => {
  it('a new finding not in the file fails', () => {
    const r = gate(['a: one', 'b: two'], { file: 'k.txt' }, { 'k.txt': 'a: one @ B1\n' });
    expect(r.code).toBe(1);
    expect(r.log[0]).toBe('FAIL b: two');
  });
  it('every finding listed: exit 0', () => {
    expect(gate(['a: one'], { file: 'k.txt' }, { 'k.txt': '# head\na: one @ B1\n' }).code).toBe(0);
  });
  it('a stale line that no longer fires fails', () => {
    const r = gate(['a: one'], { file: 'k.txt' }, { 'k.txt': 'a: one @ B1\nc: gone @ B2\n' });
    expect(r.code).toBe(1);
    expect(r.log).toContain('FAIL baseline lists "c: gone", which is gone: remove it from k.txt');
  });
  it('a closed, unknown, "none" or missing owner fails when the game passes the open owners', () => {
    const file = 'a: one @ B1\nb: two @ B9\nc: three @ none: no fix batch covers it\nd: four\ne: five @ B1+B2\nf: six @ B1+B3\n';
    const found = ['a: one', 'b: two', 'c: three', 'd: four', 'e: five', 'f: six'];
    const r = gate(found, { file: 'k.txt', open: ['B1', 'B2'] }, { 'k.txt': file });
    expect(r.code).toBe(1);
    expect(r.log.filter((l) => l.startsWith('FAIL'))).toEqual([
      'FAIL known finding "b: two" has owner "B9", which is not open: fix it or give it an open owner in k.txt',
      'FAIL known finding "c: three" has owner "none: no fix batch covers it", which is not open: fix it or give it an open owner in k.txt',
      'FAIL known finding "d: four" has no owner: give it an open owner in k.txt',
      'FAIL known finding "f: six" has owner "B1+B3", which is not open: fix it or give it an open owner in k.txt',
    ]);
    expect(gate(['a: one', 'e: five'], { file: 'k.txt', open: ['B1', 'B2'] }, { 'k.txt': 'a: one @ B1\ne: five @ B1+B2\n' }).code).toBe(0);
  });
  it('without open owners an ownerless line passes (old flat files keep working)', () => {
    expect(gate(['d: four'], { file: 'k.txt' }, { 'k.txt': 'd: four\n' }).code).toBe(0);
  });
  it('the write command adds new lines with their owner, drops stale ones, prints its count and exits 0', () => {
    const r = gate(['a: one', 'b: two'], { file: 'k.txt', write: true, ownerOf: (f) => (f.startsWith('b') ? 'B7' : 'none') }, { 'k.txt': '# head\na: one @ B1\nc: gone @ B2\n' });
    expect(r.code).toBe(0);
    expect(r.log).toEqual(['check: k.txt: 1 added, 1 removed, 2 lines']);
    expect(r.writes).toEqual([['k.txt', '# head\na: one @ B1\nb: two @ B7\n']]);
  });
  it('the write command with no ownerOf writes owner none and keeps a JSON file JSON', () => {
    const w = writeKnown(['x: 1', 'y: 2'], { file: 'k.json', io: mem({ 'k.json': '{\n "x: 1": "B1"\n}\n' }).io });
    expect(w).toEqual({ added: 1, removed: 0, lines: 2, text: '{\n "x: 1": "B1",\n "y: 2": "none"\n}\n' });
  });
  it('a check never writes: knownCheck takes no write path, and a gate without write leaves the file alone', () => {
    const io: KnownIo = { read: () => 'a: one @ B1\n', write: () => { throw new Error('a check wrote'); } };
    expect(knownCheck(['a: one', 'new: x'], { file: 'k.txt', io }).fresh).toEqual(['new: x']);
    const r = gate(['a: one', 'new: x'], { file: 'k.txt' }, { 'k.txt': 'a: one @ B1\n' });
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
  });
  it('release mode fails while any line is left, and passes on an empty list', () => {
    const r = gate(['a: one'], { file: 'k.txt', release: true }, { 'k.txt': 'a: one @ B1\n' });
    expect(r.code).toBe(1);
    expect(r.log).toContain('FAIL release: k.txt still lists "a: one"');
    expect(gate([], { file: 'k.txt', release: true }, { 'k.txt': '# nothing left\n' }).code).toBe(0);
  });
  it('reads the old formats: flat lines with # comments (K513) and a JSON map finding to owner', () => {
    expect(parseKnown('# h\r\n\r\na: one   \r\nb: two @ B1\r\na: one\r\n')).toEqual([{ finding: 'a: one' }, { finding: 'b: two', owner: 'B1' }]);
    expect(parseKnown('{\n "a: one": "B1",\n "b: two": "none: no fix batch covers it"\n}\n')).toEqual([{ finding: 'a: one', owner: 'B1' }, { finding: 'b: two', owner: 'none: no fix batch covers it' }]);
  });
  it('a missing file counts as empty', () => {
    expect(gate(['a: one'], { file: 'none.txt' }, {}).log[0]).toBe('FAIL a: one');
  });
});

describe('K650 the four callers', () => {
  const C = (id: string, text: string) => ({ id, card: id.split('#')[0] ?? '', text });
  const cat: Catalogue = { summary: { clauses: 2 }, patterns: [], oneOffs: [C('owl#1', 'Draw 2 cards.'), C('fox#1', 'Gain 1 coin.')], interactions: [] };
  const records: CardRecord[] = [{ id: 'owl#1 r0', clause: 'owl#1', op: 'draw', n: 2 }, { id: 'fox#1 r0', clause: 'fox#1', op: 'gain', n: 1 }];
  const game: CardsCheckInput = { faces: [{ card: 'owl', text: 'Draw 2 cards.' }, { card: 'fox', text: 'Gain 1 coin.' }], catalogue: cat, records, keys: [], words: {}, rulings: [], arMap: [], readings: [] };
  const today = Object.entries(cardsCheck(game)).flatMap(([k, ps]) => ps.map((p) => `${k}: ${p}`));
  const rio = (files: Record<string, string>) => { const writes: [string, string][] = []; const io: RecordIo = { comments: () => [], git: () => '', read: (p) => { const t = files[p]; if (t === undefined) throw Object.assign(new Error('no file'), { code: 'ENOENT' }); return t; }, write: (p, t) => void writes.push([p, t]) }; return { io, writes }; };
  const main = (argv: string[], g: CardsCheckInput, files: Record<string, string>) => { const log: string[] = [], f = rio(files); return { code: cardsCheckMain(argv, g, (l) => log.push(l), f.io), log, writes: f.writes }; };

  it('cardsCheckMain: --known with open owners fails a closed owner; --write-known prints its count; --release fails any line', () => {
    const file = `${today[0]!} @ B1\n${today[1]!} @ B0\n`;
    const r = main(['--known', 'k.txt'], { ...game, openOwners: ['B1'] }, { 'k.txt': file });
    expect(r.code).toBe(1);
    expect(r.log[0]).toBe(`FAIL known finding "${today[1]!}" has owner "B0", which is not open: fix it or give it an open owner in k.txt`);
    expect(main(['--known', 'k.txt'], { ...game, openOwners: ['B1', 'B0'] }, { 'k.txt': file }).code).toBe(0);
    expect(main(['--known', 'k.txt', '--release'], game, { 'k.txt': file }).code).toBe(1);
    const w = main(['--write-known'], { ...game, known: 'k.txt', ownerOf: () => 'B5' }, { 'k.txt': `${today[0]!} @ B1\n` });
    expect(w.code).toBe(0);
    expect(w.log).toEqual(['cards:check: k.txt: 1 added, 0 removed, 2 lines']);
    expect(w.writes).toEqual([['k.txt', `${today[0]!} @ B1\n${today[1]!} @ B5\n`]]);
    expect(main([], { ...game, readings: records.map((x) => ({ clause: x.clause, verdict: 'ok' as const, note: '', hash: recordsHash([x]) })) }, {}).code).toBe(0);
  });
  it('screenMain: input.known turns problems into known lines; a stale line fails', () => {
    const input = { faces: [{ id: 'owl', text: 'Draw 2 cards.' }], zoom: () => 'Draw 3 cards.', icons: {}, clauses: [], prompts: [], opened: [] };
    const plain: string[] = [];
    expect(screenMain(input, (l) => plain.push(l))).toBe(1);
    const m = mem({ 'k.txt': `${plain[0]!} @ B1\n` }), log: string[] = [];
    expect(screenMain({ ...input, known: { file: 'k.txt', io: m.io, open: ['B1'] } }, (l) => log.push(l))).toBe(0);
    const s = mem({ 'k.txt': `${plain[0]!} @ B1\nzoom gone: differs at word 1 @ B1\n` });
    expect(screenMain({ ...input, known: { file: 'k.txt', io: s.io } }, () => undefined)).toBe(1);
  });
  it('describeCheck: a known finding is dropped, a new one stays, write is refused', () => {
    const cards = [{ id: 'a', printed: 'Draw 2.', encoding: 2 }, { id: 'b', printed: 'Draw 3.', encoding: 4 }];
    const all = describeCheck(cards, (n) => `Draw ${String(n)}.`);
    expect(all.length).toBe(1);
    const m = mem({ 'k.txt': '' });
    expect(describeCheck(cards, (n) => `Draw ${String(n)}.`, undefined, undefined, { file: 'k.txt', io: m.io })).toEqual(all);
    const k = mem({ 'k.txt': JSON.stringify({ [all[0]!]: 'B1' }) });
    expect(describeCheck(cards, (n) => `Draw ${String(n)}.`, undefined, undefined, { file: 'k.txt', io: k.io, open: ['B1'] })).toEqual([]);
    expect(() => describeCheck(cards, (n) => `Draw ${String(n)}.`, undefined, undefined, { file: 'k.txt', io: k.io, write: true })).toThrow(/writeKnown/);
  });
  it('runInventory: input.known holds the interaction-row ids; a closed owner fails, the old JSON map reads as it is', () => {
    const ix = { kind: 'interaction', id: 'IX-01', cards: ['twin'], records: ['r-discount'] };
    const run = (known: Omit<KnownFindings, 'io'> | undefined, files: Record<string, string>) => {
      const log: string[] = [];
      const code = runInventory({ pieces: [ix], tests: [{ path: 't.test.ts', text: "it('IX-01', () => {})" }], interacting: ['r-new'], ...(known ? { known } : {}) }, 'x.md', false, { read: (p) => files[p] ?? null, write: (p, t) => { files[p] = t; }, log: (l) => void log.push(l) });
      return { code, log };
    };
    expect(run(undefined, {}).code).toBe(1);
    expect(run({ file: 'p.json', open: ['IX-02'] }, { 'p.json': '{ "r-new": "IX-02" }' }).code).toBe(0);
    const c = run({ file: 'p.json', open: ['IX-03'] }, { 'p.json': '{ "r-new": "IX-02" }' });
    expect(c.code).toBe(1);
    expect(c.log).toContain('inventory: known finding "r-new" has owner "IX-02", which is not open: fix it or give it an open owner in p.json');
    const n = run({ file: 'p.json' }, { 'p.json': '{}' });
    expect(n.code).toBe(1);
    expect(n.log).toContain('inventory: r-new is in no interaction row');
    const w = run({ file: 'p.txt', write: true, ownerOf: () => 'IX-04' }, {});
    expect(w.code).toBe(0);
    expect(w.log).toEqual(['inventory: p.txt: 1 added, 0 removed, 1 lines']);
  });
});

describe('K650 README recipe', () => {
  const recipe = `const io = { read: (p: string) => files[p] ?? null, write: (p: string, t: string) => void (files[p] = t) }
const k = { file: 'known.txt', io, open: ['B3'], ownerOf: () => 'B3' }
knownGate('my:check', ['x#1: no amount'], { ...k, write: true }, log) // the separate write command: prints "1 added"
knownGate('my:check', ['x#1: no amount'], k, log) // 0: listed, owner open
knownGate('my:check', [], k, log) // 1: the line is stale`;
  it('the README holds the recipe word for word, and it runs as it says', () => {
    expect(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'README.md'), 'utf8')).toContain(recipe);
    const files: Record<string, string> = {}, out: string[] = [], log = (l: string) => void out.push(l);
    const io = { read: (p: string) => files[p] ?? null, write: (p: string, t: string) => void (files[p] = t) };
    const k = { file: 'known.txt', io, open: ['B3'], ownerOf: () => 'B3' };
    expect(knownGate('my:check', ['x#1: no amount'], { ...k, write: true }, log)).toBe(0);
    expect(out).toEqual(['my:check: known.txt: 1 added, 0 removed, 1 lines']);
    expect(knownGate('my:check', ['x#1: no amount'], k, log)).toBe(0);
    expect(knownGate('my:check', [], k, log)).toBe(1);
  });
});
