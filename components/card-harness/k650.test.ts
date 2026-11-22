import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KNOWN_HEADER, cardsCheck, cardsCheckMain, describeCheck, inventory, inventoryFindings, knownCheck, knownGate, parseKnown, recordsHash, runInventory, screenMain, writeKnown, writeKnownMain, type CardRecord, type CardsCheckInput, type Catalogue, type InventoryInput, type KnownFindings, type KnownIo, type RecordIo } from './index.ts';

// K650: one known-findings list: an owner per line, new and stale lines fail, a closed owner fails, a separate write command, a release mode.
const H = `${KNOWN_HEADER}\n`;
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
    const r = gate(['a: one', 'b: two'], { file: 'k.txt' }, { 'k.txt': `${H}a: one @ B1\n` });
    expect(r.code).toBe(1);
    expect(r.log[0]).toBe('FAIL b: two');
  });
  it('every finding listed: exit 0', () => {
    expect(gate(['a: one'], { file: 'k.txt' }, { 'k.txt': `${H}# head\na: one @ B1\n` }).code).toBe(0);
  });
  it('a stale line that no longer fires fails', () => {
    const r = gate(['a: one'], { file: 'k.txt' }, { 'k.txt': `${H}a: one @ B1\nc: gone @ B2\n` });
    expect(r.code).toBe(1);
    expect(r.log).toContain('FAIL baseline lists "c: gone", which is gone: remove it from k.txt');
  });
  it('a closed, unknown, "none" or missing owner fails when the game passes the open owners', () => {
    const file = `${H}a: one @ B1\nb: two @ B9\nc: three @ none: no fix batch covers it\nd: four\ne: five @ B1+B2\nf: six @ B1+B3\n`;
    const found = ['a: one', 'b: two', 'c: three', 'd: four', 'e: five', 'f: six'];
    const r = gate(found, { file: 'k.txt', open: ['B1', 'B2'] }, { 'k.txt': file });
    expect(r.code).toBe(1);
    expect(r.log.filter((l) => l.startsWith('FAIL'))).toEqual([
      'FAIL known finding "b: two" has owner "B9", which is not open: fix it or give it an open owner in k.txt',
      'FAIL known finding "c: three" has owner "none: no fix batch covers it", which is not open: fix it or give it an open owner in k.txt',
      'FAIL known finding "d: four" has no owner: give it an open owner in k.txt',
      'FAIL known finding "f: six" has owner "B1+B3", which is not open: fix it or give it an open owner in k.txt',
    ]);
    expect(gate(['a: one', 'e: five'], { file: 'k.txt', open: ['B1', 'B2'] }, { 'k.txt': `${H}a: one @ B1\ne: five @ B1+B2\n` }).code).toBe(0);
  });
  it('without open owners an ownerless line passes (old flat files keep working)', () => {
    expect(gate(['d: four'], { file: 'k.txt' }, { 'k.txt': 'd: four\n' }).code).toBe(0);
  });
  it('the write command adds new lines with their owner, drops stale ones, prints its count and exits 0', () => {
    const m = mem({ 'k.txt': `${H}# head\na: one @ B1\nc: gone @ B2\n` }), log: string[] = [];
    expect(writeKnownMain('check', ['a: one', 'b: two'], { file: 'k.txt', io: m.io, ownerOf: (f) => (f.startsWith('b') ? 'B7' : 'none') }, (l) => log.push(l))).toBe(0);
    expect(log).toEqual(['check: k.txt: 1 added, 1 removed, 2 lines']);
    expect(m.writes).toEqual([['k.txt', `${H}# head\na: one @ B1\nb: two @ B7\n`]]);
  });
  it('the write command over an old flat file adds the header and gives every line an owner, so a " @ " finding survives', () => {
    const m = mem({ 'k.txt': '# old\nx @ y: one\n' });
    const w = writeKnown(['x @ y: one'], { file: 'k.txt', io: m.io });
    expect(w.text).toBe(`${H}# old\nx @ y: one @ none\n`);
    expect(parseKnown(w.text)).toEqual([{ finding: 'x @ y: one', owner: 'none' }]);
  });
  it('the write command with no ownerOf writes owner none and keeps a JSON file JSON', () => {
    const w = writeKnown(['x: 1', 'y: 2'], { file: 'k.json', io: mem({ 'k.json': '{\n "x: 1": "B1"\n}\n' }).io });
    expect(w).toEqual({ added: 1, removed: 0, lines: 2, text: '{\n "x: 1": "B1",\n "y: 2": "none"\n}\n' });
  });
  it('a check never writes: knownCheck takes no write path; knownGate asked to write refuses with exit 1', () => {
    const io: KnownIo = { read: () => `${H}a: one @ B1\n`, write: () => { throw new Error('a check wrote'); } };
    expect(knownCheck(['a: one', 'new: x'], { file: 'k.txt', io }).fresh).toEqual(['new: x']);
    const r = gate(['a: one', 'new: x'], { file: 'k.txt', write: true }, { 'k.txt': `${H}a: one @ B1\n` });
    expect(r.code).toBe(1);
    expect(r.log).toEqual(['FAIL check: a check never writes k.txt: run the write command (writeKnownMain) on its own']);
    expect(r.writes).toEqual([]);
  });
  it('release mode fails while any line is left, and passes on an empty list', () => {
    const r = gate(['a: one'], { file: 'k.txt', release: true }, { 'k.txt': `${H}a: one @ B1\n` });
    expect(r.code).toBe(1);
    expect(r.log).toContain('FAIL release: k.txt still lists "a: one"');
    expect(gate([], { file: 'k.txt', release: true }, { 'k.txt': '# nothing left\n' }).code).toBe(0);
  });
  it('reads the old formats exactly: flat lines with # comments (K513), " @ " inside an old line included, and a JSON map finding to owner', () => {
    expect(parseKnown('# h\r\n\r\na: one   \r\nb: two @ B1\r\na: one\r\n')).toEqual([{ finding: 'a: one' }, { finding: 'b: two @ B1' }]);
    expect(gate(['prompt for x#1: shown "2 @ 3"'], { file: 'b.txt' }, { 'b.txt': 'prompt for x#1: shown "2 @ 3"\n' }).code).toBe(0);
    expect(parseKnown(`${H}b: two @ B1\n`)).toEqual([{ finding: 'b: two', owner: 'B1' }]);
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
    const file = `${H}${today[0]!} @ B1\n${today[1]!} @ B0\n`;
    const r = main(['--known', 'k.txt'], { ...game, openOwners: ['B1'] }, { 'k.txt': file });
    expect(r.code).toBe(1);
    expect(r.log[0]).toBe(`FAIL known finding "${today[1]!}" has owner "B0", which is not open: fix it or give it an open owner in k.txt`);
    expect(main(['--known', 'k.txt'], { ...game, openOwners: ['B1', 'B0'] }, { 'k.txt': file }).code).toBe(0);
    expect(main(['--known', 'k.txt', '--release'], game, { 'k.txt': file }).code).toBe(1);
    const w = main(['--write-known'], { ...game, known: 'k.txt', ownerOf: () => 'B5' }, { 'k.txt': `${H}${today[0]!} @ B1\n` });
    expect(w.code).toBe(0);
    expect(w.log).toEqual(['cards:check: k.txt: 1 added, 0 removed, 2 lines']);
    expect(w.writes).toEqual([['k.txt', `${H}${today[0]!} @ B1\n${today[1]!} @ B5\n`]]);
    expect(main([], { ...game, readings: records.map((x) => ({ clause: x.clause, verdict: 'ok' as const, note: '', hash: recordsHash([x]) })) }, {}).code).toBe(0);
  });
  it('cardsCheckMain: a check run never writes, failing or passing', () => {
    expect(main(['--known', 'k.txt'], game, { 'k.txt': `${H}${today[0]!} @ B1\n` })).toMatchObject({ code: 1, writes: [] });
    expect(main(['--known', 'k.txt', '--release'], game, { 'k.txt': `${H}${today[0]!} @ B1\n${today[1]!} @ B1\n` })).toMatchObject({ code: 1, writes: [] });
  });
  const screenInput = { faces: [{ id: 'owl', text: 'Draw 2 cards.' }], zoom: () => 'Draw 3 cards.', icons: {}, clauses: [], prompts: [], opened: [] };
  it('screenMain: input.known turns problems into known lines; a stale line fails', () => {
    const plain: string[] = [];
    expect(screenMain(screenInput, (l) => plain.push(l))).toBe(1);
    const m = mem({ 'k.txt': `${H}${plain[0]!} @ B1\n` }), log: string[] = [];
    expect(screenMain({ ...screenInput, known: { file: 'k.txt', io: m.io, open: ['B1'] } }, (l) => log.push(l))).toBe(0);
    const s = mem({ 'k.txt': `${H}${plain[0]!} @ B1\nzoom gone: differs at word 1 @ B1\n` });
    expect(screenMain({ ...screenInput, known: { file: 'k.txt', io: s.io } }, () => undefined)).toBe(1);
  });
  it('screenMain: a check asked to write refuses with exit 1 and writes nothing', () => {
    const m = mem({}), log: string[] = [];
    expect(screenMain({ ...screenInput, known: { file: 'k.txt', io: m.io, write: true } }, (l) => log.push(l))).toBe(1);
    expect(log).toEqual(['FAIL cards:screen: a check never writes k.txt: run the write command (writeKnownMain) on its own']);
    expect(m.writes).toEqual([]);
  });
  it('describeCheck: a known finding is dropped, a new one stays, write is refused and nothing written', () => {
    const cards = [{ id: 'a', printed: 'Draw 2.', encoding: 2 }, { id: 'b', printed: 'Draw 3.', encoding: 4 }];
    const all = describeCheck(cards, (n) => `Draw ${String(n)}.`);
    expect(all.length).toBe(1);
    const m = mem({ 'k.txt': '' });
    expect(describeCheck(cards, (n) => `Draw ${String(n)}.`, undefined, undefined, { file: 'k.txt', io: m.io })).toEqual(all);
    const k = mem({ 'k.txt': JSON.stringify({ [all[0]!]: 'B1' }) });
    expect(describeCheck(cards, (n) => `Draw ${String(n)}.`, undefined, undefined, { file: 'k.txt', io: k.io, open: ['B1'] })).toEqual([]);
    expect(() => describeCheck(cards, (n) => `Draw ${String(n)}.`, undefined, undefined, { file: 'k.txt', io: k.io, write: true })).toThrow(/writeKnown/);
    expect(k.writes).toEqual([]);
  });

  const ix = { kind: 'interaction', id: 'IX-01', cards: ['twin'], records: ['r-discount'] };
  const inv = (extra: Partial<InventoryInput>, files: Record<string, string>, check = false) => {
    const log: string[] = [], writes: string[] = [];
    const input: InventoryInput = { pieces: [ix, { kind: 'op', id: 'gain' }], tests: [{ path: 't.test.ts', text: "it('IX-01', () => {})" }], interacting: ['r-new'], ...extra };
    const code = runInventory(input, 'x.md', check, { read: (p) => files[p] ?? null, write: (p, t) => { writes.push(p); files[p] = t; }, log: (l) => void log.push(l) });
    return { code, log, writes, input };
  };
  it('runInventory: every finding is under the one list: uncited pieces (the old baseline lines read as they are) and interaction-row ids', () => {
    expect(inv({}, {}).code).toBe(1);
    expect(inv({ known: { file: 'p.txt', open: ['IX-02'] } }, { 'p.txt': `${H}op:gain @ IX-02\nr-new @ IX-02\n` }).code).toBe(0);
    expect(inv({ known: { file: 'b.txt' } }, { 'b.txt': '# old baseline\nop:gain\nr-new\n' }).code).toBe(0);
    const c = inv({ known: { file: 'p.txt', open: ['IX-03'] } }, { 'p.txt': `${H}op:gain @ IX-03\nr-new @ IX-02\n` });
    expect(c.code).toBe(1);
    expect(c.log).toContain('inventory: known finding "r-new" has owner "IX-02", which is not open: fix it or give it an open owner in p.txt');
    const n = inv({ known: { file: 'p.txt' } }, { 'p.txt': `${H}r-new @ IX-02\n` });
    expect(n.code).toBe(1);
    expect(n.log).toContain('inventory: op:gain is cited by no test');
    expect(() => inv({ known: { file: 'p.txt' }, baseline: ['op:gain'] }, {})).toThrow(/pass known alone/);
    expect(inventoryFindings(inventory(inv({}, {}).input))).toEqual(['op:gain', 'r-new']);
  });
  it('runInventory: depth findings (clause, poor, a test not counted) are known lines by their clause key', () => {
    const tests = [{ path: 'c.test.ts', text: "it('cl-1', () => { sc.run() })" }];
    const d = { pieces: [], clauses: [{ id: 'cl-1', cards: [], conditional: true }], tests, interacting: [] };
    const found = inventoryFindings(inventory(d));
    expect(found).toEqual(['clause:cl-1', 'poor:cl-1']);
    expect(inv({ ...d, known: { file: 'k.txt', open: ['F1'] } }, { 'k.txt': `${H}clause:cl-1 @ F1\npoor:cl-1 @ F1\n` }).code).toBe(0);
    expect(inv({ ...d, known: { file: 'k.txt' } }, { 'k.txt': `${H}poor:cl-1 @ F1\n` }).log.some((l) => l.includes('not counted'))).toBe(true);
  });
  it('runInventory: a check asked to write refuses with exit 1, writes neither the list nor the report; the write command is writeKnownMain', () => {
    const files: Record<string, string> = {};
    const r = inv({ known: { file: 'p.txt', write: true } }, files, true);
    expect(r.code).toBe(1);
    expect(r.log).toEqual(['FAIL inventory: a check never writes p.txt: run the write command (writeKnownMain) on its own']);
    expect(r.writes).toEqual([]);
    const m = mem(files), log: string[] = [];
    expect(writeKnownMain('inventory', inventoryFindings(inventory(r.input)), { file: 'p.txt', io: m.io, ownerOf: () => 'IX-04' }, (l) => log.push(l))).toBe(0);
    expect(log).toEqual(['inventory: p.txt: 2 added, 0 removed, 2 lines']);
  });
});

describe('K650 README recipe', () => {
  const recipe = `const io = { read: (p: string) => files[p] ?? null, write: (p: string, t: string) => void (files[p] = t) }
const k = { file: 'known.txt', io, open: ['B3'], ownerOf: () => 'B3' }
writeKnownMain('my:check', ['x#1: no amount'], k, log) // the separate write command: prints "1 added"
knownGate('my:check', ['x#1: no amount'], k, log) // 0: listed, owner open
knownGate('my:check', [], k, log) // 1: the line is stale
knownGate('my:check', ['x#1: no amount'], { ...k, write: true }, log) // 1: a check never writes`;
  it('the README holds the recipe word for word, and it runs as it says', () => {
    expect(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'README.md'), 'utf8')).toContain(recipe);
    const files: Record<string, string> = {}, out: string[] = [], log = (l: string) => void out.push(l);
    const io = { read: (p: string) => files[p] ?? null, write: (p: string, t: string) => void (files[p] = t) };
    const k = { file: 'known.txt', io, open: ['B3'], ownerOf: () => 'B3' };
    expect(writeKnownMain('my:check', ['x#1: no amount'], k, log)).toBe(0);
    expect(out).toEqual(['my:check: known.txt: 1 added, 0 removed, 1 lines']);
    expect(knownGate('my:check', ['x#1: no amount'], k, log)).toBe(0);
    expect(knownGate('my:check', [], k, log)).toBe(1);
    const before = files['known.txt'];
    expect(knownGate('my:check', ['x#1: no amount'], { ...k, write: true }, log)).toBe(1);
    expect(files['known.txt']).toBe(before);
  });
});
