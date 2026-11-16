// Two overlapping kv.put calls on one key: the older write landing late must not delete the newer memory copy, and a
// read sees the newest value while its write is pending or after it failed.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { makeKv, type KvBackend } from './kv.ts';

interface Pending {
  value: unknown;
  resolve: () => void;
  reject: (e: Error) => void;
}

/** A backend whose writes wait until the test settles them, in any order. */
function manual(): { backend: KvBackend; writes: Pending[]; stored: Map<string, unknown> } {
  const writes: Pending[] = [];
  const stored = new Map<string, unknown>();
  const backend: KvBackend = {
    entries: () => Promise.resolve([...stored.entries()]),
    get: (key) => Promise.resolve(stored.get(key)),
    set: (key, value) =>
      new Promise<void>((resolve, reject) => {
        writes.push({
          value,
          resolve: () => {
            stored.set(key, value);
            resolve();
          },
          reject,
        });
      }),
    del: (key) => {
      stored.delete(key);
      return Promise.resolve();
    },
  };
  return { backend, writes, stored };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('kv.put overlapping writes (store/kv.ts)', () => {
  it('an older write confirmed after a newer one starts keeps the newer copy; a failed newer write is still read back', async () => {
    const { backend, writes } = manual();
    const kv = makeKv<string>('db', 'table', backend);
    const a = kv.put('autosave', 'A');
    const b = kv.put('autosave', 'B');
    expect(await kv.get('autosave')).toBe('B'); // pending: the newest
    writes[0]?.resolve(); // A lands in the store
    await a;
    expect(await kv.get('autosave')).toBe('B'); // the old code dropped B's copy here and read A
    writes[1]?.reject(new Error('quota'));
    await b;
    expect(await kv.get('autosave')).toBe('B'); // kept in memory, newer than the store's A
    expect(await kv.all()).toEqual([['autosave', 'B']]);
  });

  it('a confirmed write drops its own copy (the store holds it), and remove clears both', async () => {
    const { backend, writes, stored } = manual();
    const kv = makeKv<string>('db', 'table', backend);
    const a = kv.put('k', 'A');
    writes[0]?.resolve();
    await a;
    stored.set('k', 'A2'); // the store is now the only copy: a read goes to it
    expect(await kv.get('k')).toBe('A2');
    await kv.remove('k');
    await tick();
    expect(await kv.get('k')).toBeUndefined();
  });
});
