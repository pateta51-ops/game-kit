import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Chooser } from './client.ts';
import { makeChooser, type Body } from './client.ts';
import { createAdapter } from './fake-adapter.ts';
import { keyName, loadKey } from './key.ts';
import { ledgerSpent, main, runMain, runPlaytest } from './playtest.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'llm-playtester-'));
const usage = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 2000 };

describe('llm-playtester', () => {
  it('plays a dummy game to the end and writes the logs', async () => {
    const out = tmp();
    const r = await runPlaytest(createAdapter(), { seed: 's', dummy: true, out });
    expect(r).toMatchObject({ stop: 'done', decisions: 4, costUsd: 0, result: { won: true } });
    expect(readFileSync(join(r.dir, 'decisions.jsonl'), 'utf8').trim().split('\n')).toHaveLength(4);
    expect(JSON.parse(readFileSync(join(r.dir, 'replay.json'), 'utf8'))).toEqual({ moves: [0, 0, 0, 0] });
    expect(readFileSync(join(r.dir, 'summary.md'), 'utf8')).toContain('won: total 4');
  });

  it('logs an adapter throw as a finding and stops', async () => {
    const r = await runPlaytest(createAdapter(2), { seed: 's', dummy: true, out: tmp() });
    expect(r.stop).toBe('finding');
    expect(r.findings[0]).toContain('broken move');
  });

  it('the CLI loads the adapter module and plays dummy runs', async () => {
    const out = tmp();
    const lines: string[] = [];
    const code = await main(['--adapter', join(import.meta.dirname, 'fake-adapter.ts'), '--dummy', '--runs', '2', '--out', out], (s) => lines.push(s));
    expect(code).toBe(0);
    expect(lines).toHaveLength(2);
  });

  it('the CLI exits 2 on a bad --max-usd or --max-decisions', async () => {
    const adapter = join(import.meta.dirname, 'fake-adapter.ts');
    for (const bad of [['--max-usd', 'abc'], ['--max-usd', '0'], ['--max-decisions', 'abc'], ['--max-decisions', '-1']])
      expect(await main(['--adapter', adapter, '--dummy', ...bad], () => undefined)).toBe(2);
  });

  it('runPlaytest throws on a bad maxUsd or maxDecisions', async () => {
    await expect(runPlaytest(createAdapter(), { seed: 's', dummy: true, out: tmp(), maxUsd: Number.NaN })).rejects.toThrow(/maxUsd/);
    await expect(runPlaytest(createAdapter(), { seed: 's', dummy: true, out: tmp(), maxDecisions: 0 })).rejects.toThrow(/maxDecisions/);
  });

  it('retries an invalid option once, then stops with a finding', async () => {
    let calls = 0;
    const client: Chooser = () => {
      calls++;
      return Promise.resolve({ option: 7, reason: 'x', usage });
    };
    const r = await runPlaytest(createAdapter(), { seed: 's', client, out: tmp(), model: 'claude-sonnet-5-5' });
    expect(calls).toBe(2);
    expect(r.stop).toBe('finding');
    expect(r.findings).toHaveLength(2);
  });

  it('records BUG: reasons as findings', async () => {
    const client: Chooser = () => Promise.resolve({ option: 1, reason: 'BUG: only two options', usage });
    const r = await runPlaytest(createAdapter(), { seed: 's', client, out: tmp() });
    expect(r.stop).toBe('done');
    expect(r.findings).toHaveLength(2);
  });

  it('stops before a call would pass --max-usd (fake client, no network)', async () => {
    let calls = 0;
    const client: Chooser = () => {
      calls++;
      return Promise.resolve({ option: 0, reason: 'ok', usage: { ...usage, output_tokens: 1000 } });
    };
    const r = await runPlaytest(createAdapter(), { seed: 's', client, out: tmp(), maxUsd: 0.05, maxTokens: 1024 });
    expect(r.stop).toBe('max-usd');
    expect(calls).toBeGreaterThan(0);
    expect(r.costUsd).toBeLessThanOrEqual(0.05);
    expect(readFileSync(join(r.dir, 'summary.md'), 'utf8')).toContain('stopped (max-usd)');
  });

  it('key: refuses ANTHROPIC_API_KEY alone and reads <GAME>_CLAUDE_API_KEY from .env.local', () => {
    expect(keyName('fakeGame')).toBe('FAKE_GAME_CLAUDE_API_KEY');
    const dir = tmp();
    const file = join(dir, '.env.local');
    writeFileSync(file, 'ANTHROPIC_API_KEY=sk-wrong\n');
    expect(() => loadKey('fakeGame', file, {})).toThrow(/ANTHROPIC_API_KEY alone is refused/);
    expect(() => loadKey('fakeGame', join(dir, 'none'), { ANTHROPIC_API_KEY: 'sk-wrong' })).toThrow(/refused/);
    writeFileSync(file, 'ANTHROPIC_API_KEY=sk-wrong\nFAKE_GAME_CLAUDE_API_KEY="sk-right" # mine\n');
    expect(loadKey('fakeGame', file, { ANTHROPIC_API_KEY: 'sk-wrong' })).toBe('sk-right');
  });

  it('K395: never forces tool_choice, re-asks once when no tool call, prints the estimate', async () => {
    const bodies: Body[] = [];
    const sdk = { messages: { create: (b: Body) => { bodies.push(b); return Promise.resolve({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 1, output_tokens: 1 } }); } } };
    const lines: string[] = [];
    const r = await runPlaytest(createAdapter(), { seed: 's', client: makeChooser(sdk), out: tmp(), model: 'claude-sonnet-5-5', log: (s) => lines.push(s) });
    expect(bodies).toHaveLength(2);
    for (const b of bodies) expect(b.tool_choice).toEqual({ type: 'auto' });
    expect(bodies[1]!.messages[0]!.content).toContain('Reminder');
    expect(r.findings).toHaveLength(2);
    expect(r.findings[0]).toContain('no choose tool call');
    expect(lines[0]).toContain('Cost estimate');
  });

  it('K395: says so when the first call alone exceeds the cap', async () => {
    const lines: string[] = [];
    const client: Chooser = () => Promise.reject(new Error('no call expected'));
    const r = await runPlaytest(createAdapter(), { seed: 's', client, out: tmp(), maxUsd: 0.0001, log: (s) => lines.push(s) });
    expect(r.stop).toBe('max-usd');
    expect(lines.join('\n')).toContain('raise --max-usd');
  });

  it('K398: max_tokens defaults to 16000, is configurable, and a cut-off reply says so', async () => {
    const bodies: Body[] = [];
    const sdk = { messages: { create: (b: Body) => { bodies.push(b); return Promise.resolve({ content: [{ type: 'thinking' }], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 16000 } }); } } };
    const r = await runPlaytest(createAdapter(), { seed: 's', client: makeChooser(sdk), out: tmp(), model: 'claude-sonnet-5-5', log: () => undefined });
    expect(bodies[0]!.max_tokens).toBe(16000);
    expect(r.findings[0]).toBe('step 0: reply cut off at max_tokens (16000) before a choose tool call');
    await runPlaytest(createAdapter(), { seed: 's', client: makeChooser(sdk, 2000), maxTokens: 2000, out: tmp(), model: 'claude-sonnet-5-5', log: () => undefined });
    expect(bodies.at(-1)!.max_tokens).toBe(2000);
  });

  it('K398: runPlaytest maxTokens changes the estimate, the finding and the request of an injected client', async () => {
    const bodies: Body[] = [];
    const sdk = { messages: { create: (b: Body) => { bodies.push(b); return Promise.resolve({ content: [], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 3 } }); } } };
    const est = async (maxTokens?: number) => {
      const lines: string[] = [];
      const r = await runPlaytest(createAdapter(), { seed: 's', client: makeChooser(sdk), ...(maxTokens === undefined ? {} : { maxTokens }), out: tmp(), model: 'claude-sonnet-5-5', log: (s) => lines.push(s) });
      return { line: lines[0]!, finding: r.findings[0]! };
    };
    const a = await est(3000);
    const b = await est();
    expect(a.line).not.toBe(b.line);
    expect(a.finding).toContain('max_tokens (3000)');
    expect(bodies[0]!.max_tokens).toBe(3000);
  });

  it('K398: the CLI accepts --max-tokens and rejects non-integers', async () => {
    const adapter = join(import.meta.dirname, 'fake-adapter.ts');
    expect(await main(['--adapter', adapter, '--dummy', '--max-tokens', '2000', '--out', tmp()], () => undefined)).toBe(0);
    for (const bad of ['1.5', '0', 'abc', '-3'])
      expect(await main(['--adapter', adapter, '--dummy', '--max-tokens', bad], () => undefined)).toBe(2);
  });

  describe('K466 spend ledger and total cap', () => {
    const adapter = join(import.meta.dirname, 'fake-adapter.ts');
    const dummyRun = (extra: string[], env: Record<string, string> = {}) => runMain(['--adapter', adapter, '--dummy', '--out', tmp(), ...extra], () => undefined, env);
    const paying: Chooser = () => Promise.resolve({ option: 0, reason: 'r', usage });
    const M = ['--model', 'claude-sonnet-5-5'];
    it('runMain returns the runs and the total cost', async () => {
      const r = await runMain(['--adapter', adapter, '--out', tmp(), '--runs', '2', ...M], () => undefined, {}, paying);
      expect(r.runs).toHaveLength(2);
      expect(r.totalUsd).toBeGreaterThan(0);
      expect(r.totalUsd).toBeCloseTo(r.runs[0]!.costUsd + r.runs[1]!.costUsd, 10);
    });
    it('appends to the ledger per paid call, from the flag or the env var', async () => {
      const f = join(tmp(), 'sub', 'spend.jsonl');
      const r = await runMain(['--adapter', adapter, '--out', tmp(), '--ledger', f, ...M], () => undefined, {}, paying);
      const rows = readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { runId: string; seed: string; costUsd: number; at: string });
      expect(rows.length).toBe(r.runs[0]!.decisions);
      expect(rows[0]).toMatchObject({ runId: r.runs[0]!.runId, seed: '1' });
      expect(typeof rows[0]!.at).toBe('string');
      expect(ledgerSpent(f)).toBeCloseTo(r.totalUsd, 10);
      const g = join(tmp(), 'env.jsonl');
      await runMain(['--adapter', adapter, '--out', tmp(), ...M], () => undefined, { PLAYTEST_LEDGER: g }, paying);
      expect(ledgerSpent(g)).toBeGreaterThan(0);
    });
    it('a second invocation sees the first spend and stops at the cap', async () => {
      const f = join(tmp(), 'spend.jsonl');
      const first = await runMain(['--adapter', adapter, '--out', tmp(), '--ledger', f, ...M], () => undefined, {}, paying);
      const cap = String(first.totalUsd + 0.3);
      const lines: string[] = [];
      const second = await runMain(['--adapter', adapter, '--out', tmp(), '--ledger', f, '--total-cap', cap, ...M], (s) => lines.push(s), {}, paying);
      expect(lines[0]).toContain('Spent so far');
      expect(second.totalUsd).toBeGreaterThan(0);
      expect(second.totalUsd).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(ledgerSpent(f)).toBeLessThanOrEqual(first.totalUsd + 0.3 + 1e-9);
      const third = await runMain(['--adapter', adapter, '--out', tmp(), '--ledger', f, '--total-cap', String(ledgerSpent(f)), ...M], () => undefined, {}, paying);
      expect(third.code).toBe(1);
      expect(third.runs).toEqual([]);
    });
    it('a corrupt ledger line or a non-numeric costUsd refuses to start with exit 2', async () => {
      for (const bad of ['not json', '{"costUsd":"x"}', '{"runId":"a"}']) {
        const f = join(tmp(), 'spend.jsonl');
        writeFileSync(f, `{"costUsd":0.01}
${bad}
`);
        const lines: string[] = [];
        const r = await runMain(['--adapter', adapter, '--out', tmp(), '--ledger', f, '--total-cap', '1', ...M], (s) => lines.push(s), {}, paying);
        expect(r.code).toBe(2);
        expect(r.runs).toEqual([]);
        expect(lines.join('\n')).toMatch(/line 2/);
        expect(lines.join('\n')).toContain(f);
      }
    });
    it('--max-usd above what the total cap has left: the run gets only what is left', async () => {
      const f = join(tmp(), 'spend.jsonl');
      writeFileSync(f, '{"costUsd":0.99}\n');
      const lines: string[] = [];
      const r = await runMain(['--adapter', adapter, '--out', tmp(), '--ledger', f, '--total-cap', '1', '--max-usd', '5', ...M], (s) => lines.push(s), {}, paying);
      expect(lines.join('\n')).toContain('may spend $0.0100');
      expect(r.totalUsd).toBeLessThanOrEqual(0.01);
      expect(ledgerSpent(f)).toBeLessThanOrEqual(1);
    });
    it('required-cap mode refuses to start with no cap, and starts with one', async () => {
      expect((await dummyRun(['--require-cap'])).code).toBe(2);
      expect((await dummyRun([], { PLAYTEST_REQUIRE_CAP: '1' })).code).toBe(2);
      expect((await dummyRun(['--require-cap', '--total-cap', '1'])).code).toBe(0);
      expect((await dummyRun([], { PLAYTEST_REQUIRE_CAP: '1', PLAYTEST_TOTAL_CAP_USD: '1' })).code).toBe(0);
    });
    it('a bad total cap exits 2; no flags changes nothing', async () => {
      expect((await dummyRun(['--total-cap', '0'])).code).toBe(2);
      expect((await dummyRun([])).code).toBe(0);
    });
    it('a run that throws after two paid calls leaves both costs in the ledger, and the next invocation sees them', async () => {
      const f = join(tmp(), 'spend.jsonl');
      let n = 0;
      const flaky: Chooser = () => (++n > 2 ? Promise.reject(new Error('API down')) : Promise.resolve({ option: 0, reason: 'r', usage }));
      const args = ['--adapter', adapter, '--out', tmp(), '--ledger', f, ...M];
      const r = await runMain(args, () => undefined, {}, flaky);
      expect(String(r.error)).toContain('API down');
      expect(r.runs).toEqual([]);
      expect(readFileSync(f, 'utf8').trim().split('\n')).toHaveLength(2);
      expect(r.totalUsd).toBeGreaterThan(0);
      expect(ledgerSpent(f)).toBeCloseTo(r.totalUsd, 10);
      const lines: string[] = [];
      await runMain([...args, '--total-cap', String(r.totalUsd * 3)], (s) => lines.push(s), {}, paying);
      expect(Number(/so far \$([\d.]+)/.exec(lines[0]!)![1])).toBeCloseTo(r.totalUsd, 3);
      n = 0;
      await expect(main(args, () => undefined, {}, flaky)).rejects.toThrow('API down');
    });
  });
});
