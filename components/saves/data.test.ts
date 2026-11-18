import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { newHistory } from '../engine-core/index.ts';
import { CONTENT, COUNTER, RULES, type Counter } from '../engine-core/fake/counter.ts';
import { allData, exportAllData, importAllData, makeSaves, resetAllData, type AllDataConfig } from './index.ts';

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

describe('import all data (K346)', () => {
  const mk = (init: Record<string, string>, extra: Record<string, unknown> = {}) => {
    const storage = Object.assign(fakeStorage(init), { setItem: (k: string, v: string) => void storage.m.set(k, v) });
    let prog: unknown = null;
    const cfg: AllDataConfig = {
      format: 'f',
      keys: ['g.*', 'seen'],
      stores: { prog: { read: () => Promise.resolve(prog), clear: () => Promise.resolve(void (prog = null)), write: (v) => Promise.resolve(void (prog = v)) } },
      storage,
      ...extra,
    };
    return { storage, cfg, get: () => prog, set: (v: unknown) => void (prog = v) };
  };

  it('round trip: export, reset, import restores listed keys and stores; listed keys absent from the file stay', async () => {
    const a = mk({ 'g.a': '1', seen: '3', other: 'x' });
    a.set({ n: 2 });
    const text = JSON.stringify(await allData(a.cfg, 't'));
    await resetAllData(a.cfg);
    a.storage.m.set('g.late', 'keep');
    expect(await importAllData(a.cfg, text)).toEqual({ ok: true });
    expect(Object.fromEntries(a.storage.m)).toEqual({ 'g.a': '1', seen: '3', other: 'x', 'g.late': 'keep' });
    expect(a.get()).toEqual({ n: 2 });
  });

  it('ignores unlisted keys in the file', async () => {
    const a = mk({});
    const text = JSON.stringify({ format: 'f', version: 1, localStorage: { seen: '1', evil: '2' }, stores: {} });
    await importAllData(a.cfg, text);
    expect([...a.storage.m.keys()]).toEqual(['seen']);
  });

  it('refuses with the right reason', async () => {
    const a = mk({});
    expect(await importAllData(a.cfg, '{nope')).toEqual({ ok: false, reason: 'unreadable' });
    expect(await importAllData(a.cfg, '{"format":"z","version":1}')).toEqual({ ok: false, reason: 'wrong-format' });
    expect(await importAllData(a.cfg, '{"format":"f","version":2}')).toEqual({ ok: false, reason: 'newer-version' });
    expect(a.storage.m.size).toBe(0);
  });

  it('skips a throwing store write and a throwing storage write', async () => {
    const got: unknown[] = [];
    const a = mk({});
    const cfg: AllDataConfig = {
      ...a.cfg,
      stores: {
        bad: { read: () => Promise.resolve(0), clear: () => Promise.resolve(), write: () => Promise.reject(new Error('x')) },
        sync: { read: () => Promise.resolve(0), clear: () => Promise.resolve(), write: () => { throw new Error('y'); } },
        good: { read: () => Promise.resolve(0), clear: () => Promise.resolve(), write: (v) => { got.push(v); return Promise.resolve(); } },
        none: { read: () => Promise.resolve(0), clear: () => Promise.resolve(), write: (v) => { got.push(v); return Promise.resolve(); } },
      },
      storage: { ...a.storage, setItem: () => { throw new Error('full'); } },
    };
    const text = JSON.stringify({ format: 'f', version: 1, localStorage: { seen: '1' }, stores: { bad: 1, sync: 2, good: 3, none: null } });
    expect(await importAllData(cfg, text)).toEqual({ ok: true });
    expect(got).toEqual([3]);
  });
});
