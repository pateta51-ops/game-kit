import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSpeechClient, ledgerCredits, mapLimit, readLedger, type SpeechOptions, type SpeechReply } from './speech.ts';

interface Req {
  speaker: string;
  text: string;
}
const KEY = 'made-up-key-0123456789';
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-'));
  dirs.push(d);
  return path.join(d, 'clips');
};
const ok = (cost?: number): SpeechReply => ({ status: 200, audio: new Uint8Array([1, 2, 3]), ...(cost === undefined ? {} : { cost }) });
function setup(replies: (SpeechReply | Error)[], more: Partial<SpeechOptions<Req>> = {}) {
  const dir = tmp();
  const calls: { request: Req; key: string }[] = [];
  const sleeps: number[] = [];
  const client = createSpeechClient<Req>({
    dir,
    cap: 100,
    keyEnv: 'FAKE_SPEECH_KEY',
    env: { FAKE_SPEECH_KEY: KEY },
    estimate: (r) => r.text.length,
    send: (request, key) => {
      calls.push({ request, key });
      const next = replies.shift() ?? ok();
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    ...more,
  });
  return { dir, calls, sleeps, client, ledger: path.join(dir, 'ledger.jsonl') };
}
const a: Req = { speaker: 'narrator', text: 'ten chars!' };
const b: Req = { speaker: 'narrator', text: 'another clip' };

describe('speech client', () => {
  it('pays once, writes the clip and the ledger, and a second ask is free', async () => {
    const s = setup([ok(7)], { meta: (r) => ({ speaker: r.speaker, chars: r.text.length }), ext: 'pcm' });
    const first = await s.client.synth(a);
    expect(first).toEqual({ file: s.client.file(a), paid: 7 });
    expect(first.file.endsWith('.pcm')).toBe(true);
    expect([...fs.readFileSync(first.file)]).toEqual([1, 2, 3]);
    expect(await s.client.synth(a)).toEqual({ file: first.file, paid: 0 });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.key).toBe(KEY);
    expect(readLedger(s.ledger)).toMatchObject([{ id: s.client.id(a), credits: 7, speaker: 'narrator', chars: 10 }]);
    expect(s.client.spent()).toBe(7);
    expect(fs.readdirSync(s.dir).filter((f) => f.endsWith('.part'))).toEqual([]);
  });

  it('a clip cached by an earlier run is not paid for, and needs no key', async () => {
    const s = setup([], { env: {} });
    fs.mkdirSync(s.dir, { recursive: true });
    fs.writeFileSync(s.client.file(a), 'old');
    expect((await s.client.synth(a)).paid).toBe(0);
    expect(s.calls).toHaveLength(0);
    expect(fs.existsSync(s.ledger)).toBe(false);
  });

  it('identical requests at the same time share one paid request; only the first caller is told the price', async () => {
    const s = setup([]);
    const all = await Promise.all([s.client.synth(a), s.client.synth({ ...a }), s.client.synth(a)]);
    expect(s.calls).toHaveLength(1);
    expect(all.map((x) => x.paid)).toEqual([10, 0, 0]);
    expect(new Set(all.map((x) => x.file)).size).toBe(1);
    expect(s.client.spent()).toBe(10);
  });

  it('uses the estimate when the provider names no cost', async () => {
    const s = setup([{ status: 200, audio: new Uint8Array(1), cost: Number.NaN }]);
    expect((await s.client.synth(a)).paid).toBe(10);
  });

  it('refuses a request that would pass the cap, from the ledger of earlier runs', async () => {
    const s = setup([], { cap: 25 });
    fs.mkdirSync(s.dir, { recursive: true });
    fs.writeFileSync(s.ledger, JSON.stringify({ id: 'old', credits: 16 }) + '\n\n');
    await expect(s.client.synth(a)).rejects.toThrow(/cap 25 reached \(16 spent or reserved; next request 10\)/);
    expect(s.calls).toHaveLength(0);
    expect(fs.existsSync(s.client.file(a))).toBe(false);
  });

  it('a request that lands exactly on the cap is sent; the next is refused', async () => {
    const s = setup([], { cap: 10 });
    await s.client.synth(a);
    await expect(s.client.synth(b)).rejects.toThrow(/cap 10 reached/);
    expect(s.calls).toHaveLength(1);
  });

  it('requests in flight are counted, so parallel requests cannot overspend', async () => {
    const s = setup([], { cap: 25 });
    const done = await Promise.allSettled([s.client.synth(a), s.client.synth(b), s.client.synth({ ...a, text: 'third one!' })]);
    expect(done.map((d) => d.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
    expect(s.calls).toHaveLength(2);
    expect(s.client.spent()).toBe(22);
  });

  it('refuses everything when the cap is not a number, is negative or zero', async () => {
    for (const cap of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
      const s = setup([], { cap });
      await expect(s.client.synth(a)).rejects.toThrow(/cap/);
      expect(s.calls).toHaveLength(0);
    }
  });

  it('retries a busy provider, charging each attempt to the cap, and stops at the cap', async () => {
    const s = setup([{ status: 429 }, { status: 503 }, { status: 500 }], { cap: 25 });
    await expect(s.client.synth(a)).rejects.toThrow(/cap 25 reached \(20 spent/);
    expect(s.calls).toHaveLength(2);
    expect(s.sleeps).toEqual([2000, 4000]);
    expect(readLedger(s.ledger)).toMatchObject([
      { credits: 10, failed: true, status: 429 },
      { credits: 10, failed: true, status: 503 },
    ]);
  });

  it('retries then succeeds; gives up after the retry limit', async () => {
    const s = setup([{ status: 500 }, ok(3)]);
    expect((await s.client.synth(a)).paid).toBe(3);
    expect(s.client.spent()).toBe(13);
    const t = setup([{ status: 500 }, { status: 500 }, { status: 500 }], { retries: 2, cap: 1000 });
    await expect(t.client.synth(a)).rejects.toThrow(/answered 500/);
    expect(t.calls).toHaveLength(3);
  });

  it('does not retry a refusal, or a reply with no audio', async () => {
    const s = setup([{ status: 401, body: 'no' }, { status: 200 }]);
    await expect(s.client.synth(a)).rejects.toThrow(/answered 401: no/);
    await expect(s.client.synth(a)).rejects.toThrow(/answered 200/);
    expect(s.calls).toHaveLength(2);
    expect(s.sleeps).toEqual([]);
  });

  it('a request that never answers times out, is charged, and aborts', async () => {
    let aborted = false;
    const s = setup([], {
      timeoutMs: 20,
      send: (...args) =>
        new Promise<SpeechReply>(() => {
          args[2].addEventListener('abort', () => (aborted = true));
        }),
    });
    await expect(s.client.synth(a)).rejects.toThrow(/timed out/);
    expect(aborted).toBe(true);
    expect(readLedger(s.ledger)).toMatchObject([{ credits: 10, failed: true, status: null }]);
  });

  it('a failed ledger write stops every further request, and the paid clip is kept', async () => {
    let fail = true;
    const s = setup([], {
      append: () => {
        if (fail) throw new Error('disk full');
      },
    });
    await expect(s.client.synth(a)).rejects.toThrow(/ledger write failed.*disk full/);
    expect(fs.existsSync(s.client.file(a))).toBe(true);
    fail = false;
    await expect(s.client.synth(b)).rejects.toThrow(/ledger write failed/);
    expect(s.calls).toHaveLength(1);
    expect((await s.client.synth(a)).paid).toBe(0);
  });

  it('a failed ledger write on a failed attempt stops the retry', async () => {
    const s = setup([{ status: 500 }], {
      append: () => {
        throw new Error('read-only');
      },
    });
    await expect(s.client.synth(a)).rejects.toThrow(/ledger write failed/);
    expect(s.calls).toHaveLength(1);
    expect(s.sleeps).toEqual([]);
  });

  it('a clip that cannot be stored after it was paid: no part file, a ledger line, and every further request stops', async () => {
    const s = setup([ok(4)], {
      write: (f, d) => {
        fs.writeFileSync(f, d.subarray(0, 1));
        throw new Error('disk full');
      },
    });
    await expect(s.client.synth(a)).rejects.toThrow(/paid for \(4\) but could not be stored.*disk full/);
    expect(fs.readdirSync(s.dir).sort()).toEqual(['ledger.jsonl', 'ledger.lock']);
    expect(readLedger(s.ledger)).toMatchObject([
      { id: s.client.id(a), credits: 4 },
      { id: s.client.id(a), credits: 0, stored: false },
    ]);
    await expect(s.client.synth(b)).rejects.toThrow(/could not be stored, no further request/);
    expect(s.calls).toHaveLength(1);
  });

  it('a send that answers nothing, or no status, is a failed attempt: charged, and its reservation freed', async () => {
    const answers = [undefined, {}, ok(12)] as SpeechReply[];
    let n = 0;
    const s = setup([], { cap: 32, send: () => Promise.resolve(answers[n++] as SpeechReply) });
    await expect(s.client.synth(a)).rejects.toThrow(/no status/);
    await expect(s.client.synth(a)).rejects.toThrow(/no status/);
    expect(readLedger(s.ledger)).toMatchObject([
      { credits: 10, failed: true, status: null },
      { credits: 10, failed: true, status: null },
    ]);
    expect((await s.client.synth(b)).paid).toBe(12);
    expect(s.client.spent()).toBe(32);
  });

  it('one spender per ledger: a second client is refused while the lock is held, cached clips stay free', async () => {
    const s = setup([]);
    await s.client.synth(a);
    const lock = path.join(s.dir, 'ledger.lock');
    expect(fs.existsSync(lock)).toBe(true);
    const t = setup([], { dir: s.dir });
    await expect(t.client.synth(b)).rejects.toThrow(/ledger\.lock exists: another run/);
    expect(t.calls).toHaveLength(0);
    expect((await t.client.synth(a)).paid).toBe(0);
    t.client.close();
    expect(fs.existsSync(lock)).toBe(true);
    await s.client.synth(a);
    s.client.close();
    s.client.close();
    expect(fs.existsSync(lock)).toBe(false);
    expect((await t.client.synth(b)).paid).toBe(12);
    expect(fs.existsSync(lock)).toBe(true);
  });

  it('the key is struck before the body is cut, and in its URL and JSON forms', async () => {
    const odd = 'made up"key/0123+456';
    const s = setup(
      [
        { status: 400, body: 'x'.repeat(390) + odd },
        { status: 400, body: `${encodeURIComponent(odd)} ${JSON.stringify(odd)}` },
      ],
      { env: { FAKE_SPEECH_KEY: odd }, meta: () => ({ note: odd }) },
    );
    const errors: string[] = [];
    for (const r of [a, a]) await s.client.synth(r).catch((e: unknown) => errors.push(String(e)));
    expect(errors).toHaveLength(2);
    const all = [...errors, fs.readFileSync(s.ledger, 'utf-8')].join('\n');
    for (const leak of [odd, 'made up', 'made%20up', 'key/', '%22key']) expect(all).not.toContain(leak);
    expect(readLedger(s.ledger)).toMatchObject([{ note: '***' }, { note: '***' }]);
  });

  it('a damaged ledger refuses requests', async () => {
    for (const line of ['{not json', '{"id":"x"}', '{"id":"x","credits":-5}', 'null']) {
      const s = setup([]);
      fs.mkdirSync(s.dir, { recursive: true });
      fs.writeFileSync(s.ledger, line + '\n');
      await expect(s.client.synth(a)).rejects.toThrow(/line 1/);
      expect(s.calls).toHaveLength(0);
    }
  });

  it('no key: the error names the variable and nothing is sent or written', async () => {
    const envs: Record<string, string | undefined>[] = [{}, { FAKE_SPEECH_KEY: '' }];
    for (const env of envs) {
      const s = setup([], { env });
      await expect(s.client.synth(a)).rejects.toThrow('speech: FAKE_SPEECH_KEY is not set');
      expect(s.calls).toHaveLength(0);
      expect(fs.existsSync(s.ledger)).toBe(false);
    }
  });

  it('the key never reaches the ledger or an error', async () => {
    const lines: string[] = [];
    const s = setup([new Error(`bad header ${KEY}`), { status: 403, body: `key ${KEY} refused` }, ok()], {
      meta: () => ({ note: `leak ${KEY}` }),
      append: (f, l) => {
        lines.push(l);
        fs.appendFileSync(f, l);
      },
    });
    const errors: string[] = [];
    for (const r of [a, a, a]) await s.client.synth(r).catch((e: unknown) => errors.push(String(e)));
    const bad = setup([], {
      meta: () => ({ note: KEY }),
      append: () => {
        throw new Error(`cannot write ${KEY}`);
      },
    });
    await bad.client.synth(a).catch((e: unknown) => errors.push(String(e)));
    expect(errors).toHaveLength(3);
    expect(lines).toHaveLength(3);
    const all = [...errors, ...lines, fs.readFileSync(s.ledger, 'utf-8')].join('\n');
    expect(all).not.toContain(KEY);
    expect(all).toContain('***');
  });

  it('ids: stable for the same request, different for another, and a bad one is refused', async () => {
    const s = setup([]);
    expect(s.client.id(a)).toBe(s.client.id({ ...a }));
    expect(s.client.id(a)).not.toBe(s.client.id(b));
    const t = setup([], { id: (r) => `${r.speaker}/${r.text}` });
    await expect(t.client.synth(a)).rejects.toThrow(/clip id/);
    expect(t.calls).toHaveLength(0);
  });

  it('a bad estimate is refused before any request', async () => {
    const s = setup([], { estimate: () => Number.NaN });
    await expect(s.client.synth(a)).rejects.toThrow(/estimate/);
    expect(s.calls).toHaveLength(0);
  });

  it('ledgerCredits sums the named clips; no ledger is zero', async () => {
    const s = setup([ok(4), ok(5)]);
    expect(ledgerCredits(s.ledger)).toBe(0);
    await s.client.synth(a);
    await s.client.synth(b);
    expect(ledgerCredits(s.ledger)).toBe(9);
    expect(ledgerCredits(s.ledger, new Set([s.client.id(b)]))).toBe(5);
    expect(ledgerCredits(s.ledger, new Set())).toBe(0);
  });
});

describe('mapLimit', () => {
  it('keeps order, never runs more than the limit, and takes an empty list', async () => {
    let now = 0;
    let most = 0;
    const out = await mapLimit([5, 1, 3, 2, 4], 2, async (x, i) => {
      most = Math.max(most, ++now);
      await new Promise((r) => setTimeout(r, x));
      now--;
      return x * 10 + i;
    });
    expect(out).toEqual([50, 11, 32, 23, 44]);
    expect(most).toBe(2);
    expect(await mapLimit([], 3, (x: number) => Promise.resolve(x))).toEqual([]);
  });
});
