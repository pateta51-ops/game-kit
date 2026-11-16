import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { newHistory } from '../engine-core';
import { CONTENT, COUNTER, RULES, type Counter } from '../engine-core/fake/counter';
import { allData, exportAllData, makeSaves, resetAllData, type AllDataConfig } from './index';

function fakeStorage(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return {
    m,
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('all data', () => {
  it('exports every listed key (a whole key or a prefix) and every store; the reset removes them and nothing else', async () => {
    const saves = makeSaves<Counter>({ game: COUNTER, content: CONTENT, database: 'data-test', filePrefix: 'n' });
    const key = await saves.saveNamed('Mine', newHistory<Counter>({ seed: 'a' }, RULES));
    await saves.writeAutosave(newHistory<Counter>({ seed: 'a' }, RULES), 'auto');
    const storage = fakeStorage({ 'g.settings': '{"sound":true}', 'g.note': 'plain', seen: '3', other: 'stays' });
    const cfg: AllDataConfig = { format: 'neutral-data', keys: ['g.*', 'seen'], stores: { saves: saves.data }, storage };
    const data = await allData(cfg, '2026-11-15T10:00:00.000Z');
    expect(data).toMatchObject({
      format: 'neutral-data',
      version: 1,
      exportedAt: '2026-11-15T10:00:00.000Z',
      localStorage: { 'g.note': 'plain', 'g.settings': '{"sound":true}', seen: '3' }, // strings as stored: an export round-trips
    });
    expect(Object.keys(data['localStorage'] as object)).toEqual(['g.note', 'g.settings', 'seen']);
    const stored = (data['stores'] as { saves: Record<string, unknown> }).saves;
    expect(stored[key]).toMatchObject({ name: 'Mine' });
    expect(Object.keys(stored)).toContain('save-clock');

    const download = vi.fn((text: string, name: string) => text.length > 0 && name.length > 0);
    expect(await exportAllData(cfg, download)).toBe(true);
    expect(download).toHaveBeenCalledWith(expect.stringContaining('"g.settings"'), expect.stringMatching(/^neutral-data-\d{4}-\d\d-\d\d\.json$/));

    await resetAllData(cfg);
    expect([...storage.m.keys()]).toEqual(['other']);
    expect(await saves.listNamed()).toEqual([]);
    expect(await saves.readAutosave()).toBeUndefined();
    expect(await saves.data.read()).toEqual({});
  });

  it('storage that refuses reads as empty; a store that fails reads as null and does not stop the reset', async () => {
    const no = (): never => {
      throw new Error('blocked');
    };
    const cleared = vi.fn(() => Promise.resolve());
    const cfg: AllDataConfig = {
      format: 'f',
      keys: ['a'],
      storage: { length: 1, key: no, getItem: no, removeItem: no },
      stores: { bad: { read: () => Promise.reject(new Error('x')), clear: () => Promise.reject(new Error('x')) }, good: { read: () => Promise.resolve(1), clear: cleared } },
    };
    expect(await allData(cfg, 't')).toEqual({ format: 'f', version: 1, exportedAt: 't', localStorage: {}, stores: { bad: null, good: 1 } });
    await resetAllData(cfg);
    expect(cleared).toHaveBeenCalledTimes(1);
  });
});
