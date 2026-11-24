import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Answer, Chooser } from './client.ts';
import { cost, worstCost, makeChooser, type Body } from './client.ts';
import { createAdapter } from './fake-adapter.ts';
import { keyName, loadKey } from './key.ts';
import { ledgerSpent, main, runMain, runPlaytest, type GameAdapter } from './playtest.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'llm-playtester-'));
const usage = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 2000 };

const endless = () => ({ ...createAdapter(), done: () => null });

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
    const code = await main(['--adapter', join(import.meta.dirname, 'fake-adapter.ts'), '--dummy', '--runs', '2', '--out', out], (s) => lines.push(s), {});
    expect(code).toBe(0);
    expect(lines.filter((l) => !l.startsWith('PLAYTEST ENDED'))).toHaveLength(2);
  });

  it('the CLI exits 2 on a bad --max-usd or --max-decisions', async () => {
    const adapter = join(import.meta.dirname, 'fake-adapter.ts');
    for (const bad of [['--max-usd', 'abc'], ['--max-usd', '0'], ['--max-decisions', 'abc'], ['--max-decisions', '-1']])
      expect(await main(['--adapter', adapter, '--dummy', ...bad], () => undefined, {})).toBe(2);
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
    expect(r.findings).toHaveLength(1);
    expect(r.findingCounts[0]!.count).toBe(2);
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

  it('K398: max_tokens defaults to 8000, is configurable, and a cut-off reply says so', async () => {
    const bodies: Body[] = [];
    const sdk = { messages: { create: (b: Body) => { bodies.push(b); return Promise.resolve({ content: [{ type: 'thinking' }], stop_reason: 'max_tokens', usage: { input_tokens: 1, output_tokens: 8000 } }); } } };
    const r = await runPlaytest(createAdapter(), { seed: 's', client: makeChooser(sdk), out: tmp(), model: 'claude-sonnet-5-5', log: () => undefined });
    expect(bodies[0]!.max_tokens).toBe(8000);
    expect(r.findings[0]).toBe('step 0: reply cut off at max_tokens (8000) before a choose tool call');
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
    expect(await main(['--adapter', adapter, '--dummy', '--max-tokens', '2000', '--out', tmp()], () => undefined, {})).toBe(0);
    for (const bad of ['1.5', '0', 'abc', '-3'])
      expect(await main(['--adapter', adapter, '--dummy', '--max-tokens', bad], () => undefined, {})).toBe(2);
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

describe('heavy queue (K416)', () => {
  const adapter = join(import.meta.dirname, 'fake-adapter.ts');
  const held = { HEAVY_HELD: '1' };
  it('a dummy run under HEAVY_HELD=1 runs; a real-client run exits 2 before any call', async () => {
    const d = await runMain(['--adapter', adapter, '--dummy', '--out', tmp()], () => undefined, held);
    expect(d.code).toBe(0);
    expect(d.runs).toHaveLength(1);
    const lines: string[] = [];
    const r = await runMain(['--adapter', adapter, '--out', tmp()], (l) => lines.push(l), held);
    expect(r.code).toBe(2);
    expect(r.runs).toHaveLength(0);
    expect(lines.join(' ')).toContain('REFUSED');
    const ok = await runMain(['--adapter', adapter, '--out', tmp()], () => undefined, {}, () => Promise.resolve({ option: 0, reason: 'r', usage }));
    expect(ok.runs).toHaveLength(1);
  });

  it('K491: one PLAYTEST ENDED line when the game ended with a result, none otherwise', async () => {
    const lines: string[] = [];
    await runPlaytest(createAdapter(), { seed: 's', dummy: true, out: tmp(), log: (s) => lines.push(s) });
    expect(lines.filter((l) => l.startsWith('PLAYTEST ENDED'))).toEqual(['PLAYTEST ENDED won after 4 turns']);
    const none: string[] = [];
    await runPlaytest(createAdapter(), { seed: 's', dummy: true, out: tmp(), maxDecisions: 2, log: (s) => none.push(s) });
    await runPlaytest(createAdapter(2), { seed: 's', dummy: true, out: tmp(), log: (s) => none.push(s) });
    expect(none.filter((l) => l.includes('PLAYTEST ENDED'))).toEqual([]);
  });

  it('K491: the same finding repeated is reported once with a count and the run stops asking', async () => {
    let calls = 0;
    const client: Chooser = () => {
      calls++;
      return Promise.resolve({ option: 0, reason: 'BUG: wrong count.', usage });
    };
    const base = { seed: 's', client, model: 'claude-sonnet-5-5', log: () => undefined };
    const r = await runPlaytest(endless(), { ...base, out: tmp(), maxRepeats: 5 });
    expect(calls).toBe(5);
    expect(r.findings).toHaveLength(1);
    expect(r.findingCounts).toEqual([{ finding: r.findings[0], count: 5 }]);
    expect(r.stop).toBe('finding');
    expect(readFileSync(join(r.dir, 'summary.md'), 'utf8')).toContain('(x5)');
    calls = 0;
    const d = await runPlaytest(endless(), { ...base, out: tmp() });
    expect(calls).toBe(3);
    expect(d.findingCounts[0]!.count).toBe(3);
  });

  it('K491: different findings are all kept', async () => {
    let calls = 0;
    const client: Chooser = () => Promise.resolve({ option: 0, reason: `BUG: problem ${'ab'[calls++ % 2]}`, usage });
    const r = await runPlaytest(endless(), { seed: 's', client, out: tmp(), model: 'claude-sonnet-5-5', log: () => undefined });
    expect(r.findings).toHaveLength(2);
  });

  it('K491: findings that differ only in a number stay two; maxRepeats 0 never stops', async () => {
    let calls = 0;
    const client: Chooser = () => Promise.resolve({ option: 0, reason: `BUG: option ${calls++ % 2 ? 5 : 2} offered illegally`, usage });
    const base = { seed: 's', client, model: 'claude-sonnet-5-5', log: () => undefined };
    const r = await runPlaytest(endless(), { ...base, out: tmp(), maxDecisions: 6 });
    expect(r.findings).toHaveLength(2);
    calls = 0;
    const same: Chooser = () => { calls++; return Promise.resolve({ option: 0, reason: 'BUG: same', usage }); };
    const z = await runPlaytest(endless(), { ...base, client: same, out: tmp(), maxDecisions: 7, maxRepeats: 0 });
    expect(calls).toBe(7);
    expect(z).toMatchObject({ stop: 'max-decisions' });
    expect(z.findingCounts[0]!.count).toBe(7);
  });

  it('K491: exit code 0 and the ENDED line for a result; exit 1 and no line for a finding stop', async () => {
    const adapter = join(import.meta.dirname, 'fake-adapter.ts');
    const run = async (reason: string) => {
      const lines: string[] = [];
      const client: Chooser = () => Promise.resolve({ option: 0, reason, usage });
      const r = await runMain(['--adapter', adapter, '--model', 'claude-sonnet-5-5', '--out', tmp()], (s) => lines.push(s), {}, client);
      return { code: r.code, ended: lines.filter((l) => l.startsWith('PLAYTEST ENDED')) };
    };
    expect(await run('fine')).toEqual({ code: 0, ended: ['PLAYTEST ENDED won after 4 turns'] });
    expect(await run('BUG: same')).toEqual({ code: 1, ended: [] });
  });
});

describe('K741 cheaper playtests', () => {
  const base = (opts: () => ReturnType<GameAdapter['options']>) => {
    let over = false;
    const got: number[][] = [];
    const a: GameAdapter = { ...createAdapter(), start: () => { over = false; }, options: opts, choose: () => { over = true; }, answer: (v) => { got.push(v); over = true; }, done: () => (over ? { won: true, summary: 'x' } : null) };
    return { a, got };
  };
  const scripted = (picks: number[], prompts: string[] = []): Chooser => (ask) => {
    prompts.push(ask.prompt);
    return Promise.resolve({ option: picks.shift() ?? 0, reason: 'ok', usage });
  };

  it('a single option is taken without a call and logged auto', async () => {
    const { a } = base(() => ['only']);
    const r = await runPlaytest(a, { seed: 's', client: () => Promise.reject(new Error('no call expected')), out: tmp() });
    expect(r).toMatchObject({ stop: 'done', decisions: 1, costUsd: 0 });
    expect(JSON.parse(readFileSync(join(r.dir, 'decisions.jsonl'), 'utf8'))).toMatchObject({ auto: true, choice: 0, cost: 0 });
  });

  const listed = (picks: (Partial<Answer>)[], prompts: string[] = []): Chooser => (ask) => {
    prompts.push(ask.prompt);
    return Promise.resolve({ option: Number.NaN, reason: 'ok', usage, ...picks.shift() });
  };
  const multi = () => base(() => ({ kind: 'multi', min: 2, max: 3, items: ['a', 'b', 'c', 'd'] }));

  it('multi-select: one call lists the items once; the picks go to answer() sorted', async () => {
    const { a, got } = multi();
    const prompts: string[] = [];
    const r = await runPlaytest(a, { seed: 's', client: listed([{ picks: [3, 1] }], prompts), out: tmp() });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('0. a\n1. b\n2. c\n3. d');
    expect(prompts[0]!.split('Current view').length).toBe(2);
    expect(got).toEqual([[1, 3]]);
    expect(r).toMatchObject({ stop: 'done', decisions: 1 });
  });

  it('multi-select: fewer picks than min is retried once with the error', async () => {
    const { a, got } = multi();
    const prompts: string[] = [];
    const r = await runPlaytest(a, { seed: 's', client: listed([{ picks: [1] }, { picks: [0, 2] }], prompts), out: tmp() });
    expect(prompts[1]).toContain('pick 2 to 3 items, not 1');
    expect(got).toEqual([[0, 2]]);
    expect(r.findings).toEqual(['step 0: pick 2 to 3 items, not 1']);
  });

  it('an invalid list answer twice is a finding and stops the run', async () => {
    const { a, got } = multi();
    const r = await runPlaytest(a, { seed: 's', client: listed([{ picks: [0, 0] }, { picks: [0, 9] }]), out: tmp() });
    expect(got).toEqual([]);
    expect(r.stop).toBe('finding');
    expect(r.findings).toEqual(['step 0: picks must be different numbers from 0 to 3', 'step 0: picks must be different numbers from 0 to 3']);
  });

  it('--max-usd stops before a multi-select call', async () => {
    const { a } = multi();
    const r = await runPlaytest(a, { seed: 's', client: () => Promise.reject(new Error('no call expected')), out: tmp(), maxUsd: 0.0001, log: () => undefined });
    expect(r.stop).toBe('max-usd');
    expect(r.costUsd).toBe(0);
  });

  it('split: one call, limits and total checked, then answer()', async () => {
    const { a, got } = base(() => ({ kind: 'split', points: 5, targets: [{ label: 'x', max: 2 }, { label: 'y' }, { label: 'z', min: 1 }] }));
    const prompts: string[] = [];
    const r = await runPlaytest(a, { seed: 's', client: listed([{ points: [3, 1, 1] }, { points: [2, 1, 2] }], prompts), out: tmp() });
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('0: 0-2, 1: 0-5, 2: 1-5');
    expect(prompts[1]).toContain('x must get 0 to 2, not 3');
    expect(got).toEqual([[2, 1, 2]]);
    expect(r.decisions).toBe(1);
  });

  it('a question that cannot be answered is an adapter finding before any call', async () => {
    const none = () => Promise.reject(new Error('no call expected'));
    for (const q of [{ kind: 'multi', min: 3, max: 3, items: ['a', 'b'] }, { kind: 'split', points: 2, targets: [] }, { kind: 'split', points: 9, targets: [{ label: 'x', max: 4 }, { label: 'y', max: 4 }] }] as ReturnType<GameAdapter['options']>[]) {
      const r = await runPlaytest(base(() => q).a, { seed: 's', client: none, out: tmp() });
      expect(r.stop).toBe('finding');
      expect(r.findings[0]).toContain('adapter question invalid');
    }
  });

  it('groups print as headers; duplicate labels get #2 and one summary line, not a finding', async () => {
    const { a } = base(() => [{ label: 'play', group: 'Hand' }, { label: 'play', group: 'Hand' }, { label: 'play', group: 'Board' }]);
    const prompts: string[] = [];
    const r = await runPlaytest(a, { seed: 's', client: scripted([1], prompts), out: tmp() });
    expect(prompts[0]).toContain('[Hand]\n0. play\n1. play #2\n[Board]\n2. play');
    expect(r.findings).toEqual([]);
    expect(readFileSync(join(r.dir, 'summary.md'), 'utf8')).toContain('- Duplicate option labels: 1');
    expect(JSON.parse(readFileSync(join(r.dir, 'decisions.jsonl'), 'utf8'))).toMatchObject({ options: ['play', 'play #2', 'play'] });
  });

  it('effort (default low, --effort) and cache_control land in the request; reference() is in the cached system block', async () => {
    const bodies: Body[] = [];
    const sdk = { messages: { create: (b: Body) => { bodies.push(b); return Promise.resolve({ content: [{ type: 'tool_use', input: { option: 1, reason: 'ok' } }], usage: { input_tokens: 1, output_tokens: 1 } }); } } };
    await runPlaytest({ ...createAdapter(), reference: () => 'CARD-A: full text' }, { seed: 's', client: makeChooser(sdk), out: tmp(), log: () => undefined });
    expect(bodies[0]!['output_config']).toEqual({ effort: 'low' });
    const sys = bodies[0]!['system'] as { text: string; cache_control?: unknown }[];
    expect(sys.at(-1)).toMatchObject({ cache_control: { type: 'ephemeral' } });
    expect(sys.at(-1)!.text).toContain('CARD-A: full text');
    expect(JSON.stringify(bodies[0]!['tools'])).toContain('at most 20 words');
    bodies.length = 0;
    await runPlaytest(createAdapter(), { seed: 's', client: makeChooser(sdk), out: tmp(), log: () => undefined, effort: 'high' });
    expect(bodies[0]!['output_config']).toEqual({ effort: 'high' });
    expect(await main(['--adapter', join(import.meta.dirname, 'fake-adapter.ts'), '--dummy', '--effort', 'max'], () => undefined, {})).toBe(2);
    expect(await main(['--adapter', join(import.meta.dirname, 'fake-adapter.ts'), '--dummy', '--effort', 'medium', '--out', tmp()], () => undefined, {})).toBe(0);
  });

  it('plain string lists still work unchanged (no auto, no ask field)', async () => {
    const r = await runPlaytest(createAdapter(), { seed: 's', client: scripted([0, 0, 0, 0]), out: tmp() });
    const rows = readFileSync(join(r.dir, 'decisions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(rows).toHaveLength(4);
    for (const x of rows) expect(x).not.toHaveProperty('auto');
    expect(rows[0]!['options']).toEqual(['add 1', 'add 2']);
  });
});

describe('K740 haiku prices', () => {
  const u = (i: number, w: number, r: number, o: number) => ({ input_tokens: i, output_tokens: o, cache_creation_input_tokens: w, cache_read_input_tokens: r });
  it('low rates up to 100K', () => {
    expect(cost(u(1000, 2000, 3000, 100), 'claude-haiku-5-5')).toBeCloseTo((1000 * 0.1 + 2000 * 0.125 + 3000 * 0.01 + 100 * 0.5) / 1e6, 12);
  });
  it('high rates over 100K, cache reads count', () => {
    expect(cost(u(1000, 0, 100_000, 100), 'claude-haiku-5-5')).toBeCloseTo((1000 * 0.5 + 100_000 * 0.05 + 100 * 2.5) / 1e6, 12);
  });
  it('worstCost and unknown model', () => {
    const ask = { model: 'claude-haiku-5-5', system: ['x'], prompt: 'y' };
    expect(worstCost(ask, 1000)).toBeCloseTo(((1002 / 3) * 0.125 + 1000 * 0.5) / 1e6, 12);
    expect(worstCost({ ...ask, prompt: 'y'.repeat(400_000) }, 1000)).toBeCloseTo(((401_001 / 3) * 0.625 + 1000 * 2.5) / 1e6, 9);
    expect(() => cost(u(1, 0, 0, 1), 'nope')).toThrow('No price');
    expect(() => worstCost({ ...ask, model: 'nope' })).toThrow('No price');
  });
});
