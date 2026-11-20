// K497: card gates gaps: screen log recorder, interaction-row pending map, restriction words path.
import { mkdtempSync, rmSync } from 'node:fs';
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
