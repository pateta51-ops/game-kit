import { describe, expect, it } from 'vitest';
import { applyPatches, errata, rulingsFor, wordDiff, type PatchFile, type PatchLog } from './index.ts';

const src = [
  { code: '01', name: 'Scout', text: 'Gain 1 gold' },
  { code: '02', name: 'Mine', text: 'Gain 2 gold' },
];

describe('applyPatches', () => {
  it('patches by code, adds new cards, leaves the source alone, logs each row', () => {
    const files: PatchFile[] = [
      { reason: 'hidden-fixes', rows: [{ code: '01', patch: true, text: 'Gain 1 gold.' }] },
      { reason: 'additional-cards', rows: [{ code: '03', name: 'Digital' }] },
    ];
    const log: PatchLog = [];
    const out = applyPatches(src, files, log);
    expect(out).toEqual([
      { code: '01', name: 'Scout', text: 'Gain 1 gold.' },
      { code: '02', name: 'Mine', text: 'Gain 2 gold' },
      { code: '03', name: 'Digital' },
    ]);
    expect(src[0]?.text).toBe('Gain 1 gold');
    expect(log).toEqual([
      { reason: 'hidden-fixes', code: '01', fields: ['text'] },
      { reason: 'additional-cards', code: '03', fields: ['name'] },
    ]);
  });
  it('later files win on the same field', () => {
    const out = applyPatches(src, [
      { reason: 'a', rows: [{ code: '02', patch: true, name: 'A' }] },
      { reason: 'b', rows: [{ code: '02', patch: true, name: 'B' }] },
    ]);
    expect(out[1]?.name).toBe('B');
  });
  it('throws on a patch for a missing card and on a duplicate added card', () => {
    expect(() => applyPatches(src, [{ reason: 'x', rows: [{ code: '99', patch: true }] }])).toThrow('no card 99');
    expect(() => applyPatches(src, [{ reason: 'y', rows: [{ code: '01' }] }])).toThrow('already exists');
  });
});

describe('errata and rulings (K105)', () => {
  it('word diff marks deleted and inserted words', () => {
    expect(wordDiff('Gain 1 gold', 'Gain 2 gold now')).toEqual([
      { op: 'same', text: 'Gain ' }, { op: 'del', text: '1' }, { op: 'ins', text: '2' }, { op: 'same', text: ' gold' }, { op: 'ins', text: ' now' },
    ]);
    expect(wordDiff('', '')).toEqual([]);
  });
  it('errata lists changed fields, skips added cards, limits to fields', () => {
    const played = applyPatches(src, [
      { reason: 'r', rows: [{ code: '01', patch: true, text: 'Gain 1 gold.', cost: 2 }, { code: '09', name: 'New' }] },
    ]);
    const all = errata(src, played);
    expect(all.map((e) => [e.code, e.field])).toEqual([['01', 'text'], ['01', 'cost']]);
    expect(all[0]?.printed).toBe('Gain 1 gold');
    expect(all[0]?.diff?.some((p) => p.op === 'ins')).toBe(true);
    expect(all[1]?.diff).toBeUndefined();
    expect(errata(src, played, ['cost'])).toHaveLength(1);
  });
  it('rulings by card, newest first', () => {
    const r = { '01': [{ question: 'a', ruling: 'x' }, { question: 'b', ruling: 'y', date: '2024-01-01' }, { question: 'c', ruling: 'z', date: '2025-01-01' }] };
    expect(rulingsFor(r, '01').map((x) => x.question)).toEqual(['c', 'b', 'a']);
    expect(rulingsFor(r, '02')).toEqual([]);
  });
});
