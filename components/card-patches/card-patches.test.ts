import { describe, expect, it } from 'vitest';
import { applyPatches, type PatchFile, type PatchLog } from './index';

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
