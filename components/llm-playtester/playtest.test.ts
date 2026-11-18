import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Chooser } from './client.ts';
import { makeChooser, type Body } from './client.ts';
import { createAdapter } from './fake-adapter.ts';
import { keyName, loadKey } from './key.ts';
import { main, runPlaytest } from './playtest.ts';

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
    const r = await runPlaytest(createAdapter(), { seed: 's', client, out: tmp(), maxUsd: 0.05 });
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
});
