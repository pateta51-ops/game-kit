// Node only, build time only: a paid text-to-speech client with a spending cap and a cost ledger. Never import it from the app.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

export interface SpeechReply {
  status: number;
  audio?: Uint8Array;
  /** What the provider says it charged; the estimate is used without it. */
  cost?: number;
  body?: string;
}

export interface SpeechOptions<R> {
  /** Clips and `ledger.jsonl` live here. */
  dir: string;
  cap: number;
  /** Name of the environment variable that holds the key. */
  keyEnv: string;
  /** The only place that talks to the provider. */
  send: (request: R, key: string, signal: AbortSignal) => Promise<SpeechReply>;
  estimate: (request: R) => number;
  id?: (request: R) => string;
  /** Extra ledger fields (voice, model, length). */
  meta?: (request: R) => Record<string, string | number>;
  ext?: string;
  retries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  env?: Record<string, string | undefined>;
  append?: (file: string, line: string) => void;
  write?: (file: string, audio: Uint8Array) => void;
}

export interface SpeechClient<R> {
  synth(request: R): Promise<{ file: string; paid: number }>;
  id(request: R): string;
  file(request: R): string;
  /** Everything the ledger holds, failed attempts included. */
  spent(): number;
  /** Frees `ledger.lock` (also freed when the process exits). */
  close(): void;
}

interface LedgerRow {
  id: string;
  credits: number;
}

export function readLedger(file: string): LedgerRow[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l, i) => {
      let row: LedgerRow;
      try {
        row = JSON.parse(l) as LedgerRow;
      } catch {
        throw new Error(`speech ledger ${file}: line ${i + 1} is not JSON`);
      }
      if (typeof row?.id !== 'string' || !Number.isFinite(row.credits) || row.credits < 0)
        throw new Error(`speech ledger ${file}: line ${i + 1} has no id or credits`);
      return row;
    });
}

/** What the clips with these ids were charged. */
export const ledgerCredits = (file: string, ids?: Set<string>): number =>
  readLedger(file).reduce((n, x) => (!ids || ids.has(x.id) ? n + x.credits : n), 0);

const held = new Set<string>();
let hooked = false;

export function createSpeechClient<R>(o: SpeechOptions<R>): SpeechClient<R> {
  const ledger = path.join(o.dir, 'ledger.jsonl');
  const lockFile = path.join(o.dir, 'ledger.lock');
  let locked = false;
  const write = o.write ?? writeFileSync;
  const env = o.env ?? process.env;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const append = o.append ?? appendFileSync;
  const inFlight = new Map<string, Promise<{ file: string; paid: number }>>();
  let reserved = 0;
  let broken: string | undefined;

  const id = (r: R): string => {
    const v = o.id ? o.id(r) : createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 20);
    if (!/^[\w-]+$/.test(v)) throw new Error('speech: a clip id may hold only letters, digits, _ and -');
    return v;
  };
  const file = (r: R) => path.join(o.dir, `${id(r)}.${o.ext ?? 'bin'}`);
  const scrub = (s: string, key: string) =>
    [key, JSON.stringify(key).slice(1, -1), encodeURIComponent(key)].reduce((t, k) => t.replaceAll(k, '***'), s);

  async function paidFor(r: R, out: string) {
    const key = env[o.keyEnv];
    if (!key) throw new Error(`speech: ${o.keyEnv} is not set`);
    const estimate = o.estimate(r);
    if (!Number.isFinite(estimate) || estimate < 0) throw new Error('speech: the estimate is not a number');
    mkdirSync(o.dir, { recursive: true });
    if (!locked) {
      try {
        writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      } catch {
        throw new Error(`speech: ${lockFile} exists: another run is spending from this ledger (delete the file if none is)`);
      }
      locked = true;
      held.add(lockFile);
      if (!hooked) {
        hooked = true;
        process.on('exit', () => {
          for (const f of held) rmSync(f, { force: true });
        });
      }
    }
    const log = (credits: number, extra?: Record<string, unknown>) => {
      try {
        append(ledger, scrub(JSON.stringify({ ...o.meta?.(r), at: new Date().toISOString(), id: id(r), credits, ...extra }), key) + '\n');
      } catch (e) {
        broken = 'the ledger write failed';
        // eslint-disable-next-line preserve-caught-error -- the cause could hold the key
        throw new Error(`speech: the ledger write failed, no further request is sent: ${scrub(String(e), key)}`);
      }
    };
    const record = (credits: number, failed?: { status: number | null }) => {
      try {
        log(credits, failed && { failed: true, ...failed });
      } finally {
        reserved -= estimate;
      }
    };
    for (let attempt = 0; ; attempt++) {
      if (broken) throw new Error(`speech: ${broken}, no further request is sent`);
      const spent = ledgerCredits(ledger) + reserved;
      if (!Number.isFinite(o.cap) || o.cap < 0 || spent + estimate > o.cap)
        throw new Error(`speech: spending cap ${o.cap} reached (${spent} spent or reserved; next request ${estimate})`);
      reserved += estimate;
      const stop = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let reply: SpeechReply | undefined;
      try {
        reply = await Promise.race([
          o.send(r, key, stop.signal),
          new Promise<never>((_, no) => {
            timer = setTimeout(() => {
              stop.abort();
              no(new Error('timed out'));
            }, o.timeoutMs ?? 120_000);
          }),
        ]);
      } catch (e) {
        record(estimate, { status: null });
        // eslint-disable-next-line preserve-caught-error -- the cause could hold the key
        throw new Error(`speech: request failed: ${scrub(String(e), key)}`);
      } finally {
        clearTimeout(timer);
      }
      if (!reply || typeof reply.status !== 'number') {
        record(estimate, { status: null });
        throw new Error('speech: the provider call returned no status');
      }
      if (reply.status >= 200 && reply.status < 300 && reply.audio) {
        const c = reply.cost;
        const paid = c !== undefined && Number.isFinite(c) && c >= 0 ? c : estimate;
        let bad: Error | undefined;
        try {
          record(paid);
        } catch (e) {
          bad = e as Error;
        }
        const part = `${out}.${process.pid}.${randomUUID()}.part`;
        try {
          write(part, reply.audio);
          renameSync(part, out);
        } catch (e) {
          rmSync(part, { force: true });
          try {
            log(0, { stored: false });
          } catch {
            // already stopping
          }
          broken = 'a paid clip could not be stored';
          // eslint-disable-next-line preserve-caught-error -- the cause could hold the key
          throw new Error(`speech: clip ${id(r)} was paid for (${paid}) but could not be stored, no further request is sent: ${scrub(String(e), key)}`);
        }
        if (bad) throw bad;
        return { file: out, paid };
      }
      record(estimate, { status: reply.status });
      if ((reply.status === 429 || reply.status >= 500) && attempt < (o.retries ?? 5)) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      throw new Error(`speech: provider answered ${reply.status}: ${scrub(reply.body ?? '', key).slice(0, 400)}`);
    }
  }

  return {
    id,
    file,
    spent: () => ledgerCredits(ledger),
    close() {
      if (!locked) return;
      locked = false;
      held.delete(lockFile);
      rmSync(lockFile, { force: true });
    },
    async synth(r) {
      const out = file(r);
      if (existsSync(out)) return { file: out, paid: 0 };
      const pending = inFlight.get(out);
      if (pending) return pending.then((x) => ({ ...x, paid: 0 }));
      const work = paidFor(r, out).finally(() => inFlight.delete(out));
      inFlight.set(out, work);
      return work;
    },
  };
}

/** Runs `fn` over `items` with at most `n` in flight. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}
