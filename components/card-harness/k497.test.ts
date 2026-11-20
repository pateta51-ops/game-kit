// K497: card gates gaps: screen log recorder, interaction-row pending map, restriction words path.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESTRICTION_WORDS_PATH, cardsCheckMain, readScreenLogs, recordOpened, recordPrompt, recordsHash, runInventory, screenMain, wordsPathOf, type CardRecord, type CardsCheckInput, type InventoryInput, type ScreenInput } from './index.ts';

describe('screen log recorder', () => {
  const faces = [{ id: 'scout', text: 'Draw 2 cards.' }];
  const clauses = [{ id: 'scout#1', text: 'Draw 2 cards.' }];
  const dir = mkdtempSync(join(tmpdir(), 'k497-'));
  const input = (l: ReturnType<typeof readScreenLogs>): ScreenInput => ({ faces, clauses, zoom: (t) => t, icons: {}, ...l });
  it('round trip: prompts, options and opened texts come back, several files merge', () => {
    const a = join(dir, 'a.jsonl'), b = join(dir, 'b.jsonl');
    recordPrompt(a, { clause: 'scout#1', shown: 'Draw 2 cards?', screenOptions: ['Yes', 'No'], engineOptions: ['yes', 'no'] });
    recordOpened(b, 'scout#1');
    recordOpened(b, 'other#1');
    const r = readScreenLogs([a, b, join(dir, 'missing.jsonl')]);
    expect(r.prompts).toEqual([{ clause: 'scout#1', shown: 'Draw 2 cards?', screenOptions: ['Yes', 'No'], engineOptions: ['yes', 'no'] }]);
    expect(r.opened.sort()).toEqual(['other#1', 'scout#1']);
    const out: string[] = [];
    expect(screenMain({ ...input(r), label: (e) => String(e).replace(/^./, (c) => c.toUpperCase()) }, (l) => out.push(l))).toBe(1);
    expect(out).toEqual(['other#1 opens a prompt no test scanned']);
  });
  it('a recorded prompt with no amount fails as through Delivery; with it, exit 0', () => {
    const f = join(dir, 'c.jsonl');
    recordPrompt(f, { clause: 'scout#1', shown: 'Draw cards?' });
    const out: string[] = [];
    expect(screenMain(input(readScreenLogs([f])), (l) => out.push(l))).toBe(1);
    expect(out).toEqual(['prompt for scout#1: no amount']);
    const g = join(dir, 'd.jsonl');
    recordPrompt(g, { clause: 'scout#1', shown: 'Draw 2 cards?' });
    expect(screenMain(input(readScreenLogs([g])), () => undefined)).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('interaction row pending map', () => {
  const ix = { kind: 'interaction', id: 'IX-01', cards: ['twin'], records: ['r-discount'] };
  const run = (extra: Partial<InventoryInput>) => {
    const log: string[] = [];
    const code = runInventory({ pieces: [ix], tests: [{ path: 't.test.ts', text: "it('IX-01', () => {})" }], ...extra }, 'x.md', false, { read: () => null, write: () => undefined, log: (l) => void log.push(l) });
    return { code, log };
  };
  it('a pending record is reported, not failed; without the map it fails', () => {
    expect(run({ interacting: ['r-new'] }).code).toBe(1);
    const r = run({ interacting: ['r-new'], interactingPending: { 'r-new': 'add it to IX-02' } });
    expect(r.code).toBe(0);
    expect(r.log).toContain('inventory: r-new is in no interaction row (pending: add it to IX-02)');
  });
  it('a pending entry no longer a finding fails as stale', () => {
    const r = run({ interacting: ['r-discount'], interactingPending: { 'r-discount': 'x', gone: 'y' } });
    expect(r.code).toBe(1);
    expect(r.log.filter((l) => l.includes('stale pending'))).toEqual(['inventory: stale pending entry: gone', 'inventory: stale pending entry: r-discount']);
  });
});

describe('restriction words path', () => {
  const C = (id: string, text: string) => ({ id, card: id.split('#')[0] ?? '', text });
  const records: CardRecord[] = [{ id: 's#1 r0', clause: 's#1', op: 'gain', n: 1, optional: true }];
  const game: CardsCheckInput = {
    faces: [{ card: 's', text: 'You may gain 1 coin.' }],
    catalogue: { summary: { clauses: 1 }, patterns: [], oneOffs: [C('s#1', 'You may gain 1 coin.')], interactions: [] },
    records, keys: ['optional'], words: {}, rulings: [], arMap: [],
    readings: [{ clause: 's#1', verdict: 'ok', note: '', hash: recordsHash(records) }],
  };
  const io = (files: Record<string, string>) => ({ comments: () => [], write: () => undefined, git: () => '', read: (p: string) => files[p] ?? '' });
  it('default path constant and flag', () => {
    expect(wordsPathOf([])).toBe(RESTRICTION_WORDS_PATH);
    expect(wordsPathOf(['--words', 'x/w.json'])).toBe('x/w.json');
  });
  it('--words <path> replaces the input words; exit codes', () => {
    expect(cardsCheckMain([], game, () => undefined)).toBe(1);
    const log: string[] = [];
    expect(cardsCheckMain(['--words', 'my/w.json'], game, (l) => log.push(l), io({ 'my/w.json': '{"optional:true":["you may"]}' }))).toBe(0);
    expect(cardsCheckMain(['--words', 'my/w.json'], game, (l) => log.push(l))).toBe(1);
    expect(log).toContain('FAIL --words needs a RecordIo with read');
    expect(cardsCheckMain(['--words', 'bad.json'], game, (l) => log.push(l), io({ 'bad.json': 'nope' }))).toBe(1);
  });
});

describe('K497 fix round', () => {
  it('recorder makes the folder; several writer processes interleave and every record reads back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'k497m-'));
    const f = join(dir, 'deep', 'er', 'log.jsonl');
    const mod = join(import.meta.dirname, 'screenLog.ts').replace(/\\/g, '/');
    const code = `import { recordPrompt } from 'file:///${mod}'; for (let i = 0; i < 60; i++) recordPrompt(process.argv[1], { clause: 'w' + process.argv[2] + '#' + i, shown: 'Draw 2 ' + 'x'.repeat(2000) })`;
    const kids = [0, 1, 2, 3].map((w) => spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code, f, String(w)], { stdio: 'pipe' }));
    return Promise.all(kids.map((k) => new Promise<number | null>((r) => k.on('close', r)))).then((codes) => {
      expect(codes).toEqual([0, 0, 0, 0]);
      const r = readScreenLogs([f]);
      expect(r.warnings).toEqual([]);
      expect(r.prompts.length).toBe(240);
      expect(new Set(r.prompts.map((p) => p.clause)).size).toBe(240);
      rmSync(dir, { recursive: true, force: true });
    });
  });
  it('a torn line is skipped and named; the rest reads back', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'k497t-')), 'log.jsonl');
    recordOpened(f, 'a#1');
    appendFileSync(f, '{"t":"prompt","clause":"b#1","sh\n');
    recordOpened(f, 'c#1');
    const r = readScreenLogs([f]);
    expect(r.opened.sort()).toEqual(['a#1', 'c#1']);
    expect(r.warnings).toEqual([`${f} line 2: skipped, not a record`]);
  });
  const C = (id: string, text: string) => ({ id, card: id.split('#')[0] ?? '', text });
  const records: CardRecord[] = [{ id: 's#1 r0', clause: 's#1', op: 'gain', n: 1, optional: true }];
  const base = {
    faces: [{ card: 's', text: 'You may gain 1 coin.' }],
    catalogue: { summary: { clauses: 1 }, patterns: [], oneOffs: [C('s#1', 'You may gain 1 coin.')], interactions: [] },
    records, keys: ['optional'], rulings: [], arMap: [],
    readings: [{ clause: 's#1', verdict: 'ok' as const, note: '', hash: recordsHash(records) }],
  };
  const io = (files: Record<string, string>) => ({ comments: () => [], write: () => undefined, git: () => '', read: (p: string) => { if (!(p in files)) throw new Error('ENOENT'); return files[p]!; } });
  it('no words and no flag: the default path loads when it exists, else none', () => {
    expect(cardsCheckMain([], base, () => undefined, io({ [RESTRICTION_WORDS_PATH]: '{"optional:true":["you may"]}' }))).toBe(0);
    const log: string[] = [];
    expect(cardsCheckMain([], base, (l) => log.push(l), io({}))).toBe(1);
    expect(log.join('\n')).toContain('optional=true');
  });
  it('--list-restrictions takes --words', () => {
    const log: string[] = [];
    expect(cardsCheckMain(['--list-restrictions', 'B', '--words', 'w.json'], { ...base, batch: () => ['s#1'] }, (l) => log.push(l), io({ 'w.json': '{"optional:true":["You may"]}' }))).toBe(0);
    expect(log).toEqual(['s#1 1 [You may] You may gain 1 coin.']);
  });
  it('--record takes --words (a bad words file stops it before anything is written)', () => {
    const log: string[] = [];
    expect(cardsCheckMain(['--record', 'B', '--pr', '1', '--words', 'bad.json'], { ...base, batch: () => ['s#1'] }, (l) => log.push(l), io({ 'bad.json': 'x' }))).toBe(1);
    expect(log[0]).toMatch(/^FAIL --words bad.json/);
  });
  it('an old-style call (explicit words, no recorder, no pending map, no --words) is unchanged', () => {
    const words = { 'optional:true': ['you may'] };
    const log: string[] = [];
    expect(cardsCheckMain([], { ...base, words }, (l) => log.push(l))).toBe(0);
    expect(log).toEqual(['ok   clauses (0)', 'ok   restrictions (0)', 'ok   patterns (0)', 'ok   readings (0)']);
    expect(cardsCheckMain([], { ...base, words: {} }, (l) => log.push(l))).toBe(1);
    const l: string[] = [];
    const c = runInventory({ pieces: [], tests: [], interacting: ['r1'] }, 'x.md', false, { read: () => null, write: () => undefined, log: (x) => void l.push(x) });
    expect(c).toBe(1);
    expect(l).toContain('inventory: r1 is in no interaction row');
    expect(screenMain({ faces: [], clauses: [{ id: 'k#1', text: 'Draw 2.' }], zoom: (t) => t, icons: {}, prompts: [{ clause: 'k#1', shown: 'Draw?' }], opened: [] }, () => undefined)).toBe(1);
  });
});
