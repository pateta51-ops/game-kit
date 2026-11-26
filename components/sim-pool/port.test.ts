import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { isChecking, kernelPort, setInvariantChecking } from '../engine-core/index.ts';
import { DriverRng, fuzz, fuzzMain, legalAnswers, playOne, portBotDriver, randomPortDriver, runGames, wholeGame, type PortSimGame } from './index.ts';
import { simGame, type PortGame } from './fake/port-game.ts';
import { simGame as kernelGame } from './fake/game.ts';
import type { Counter } from '../engine-core/fake/counter.ts';

const module = new URL('./fake/port-game.ts', import.meta.url).href;
const specs = ['a', 'b', 'c', 'd'].map((seed, index) => ({ seed, index, driver: 'random' }));

describe('K645 EnginePort simulations', () => {
  it('plays an opaque port through actual setup, explicit repeated picks and string prompt ids', async () => {
    const record = playOne(simGame, await simGame.content(), specs[0]!);
    expect(record.error).toBeUndefined();
    expect(record.result).toEqual({ winner: 'actor', score: 4 });
    expect(record.actions).toBe(3);
    expect(record.summary).toEqual({ phase: 3, score: 4 });
    expect(record.resolved).toEqual(['choose', 'finish', 'pass']);
    expect(record.portExecution).toBe(1);
    expect(record.triggerCapChecked).toBeUndefined();
  });

  it('uses the real workers, whole-game accounting and fuzz command exit codes', async () => {
    const serial = await runGames({ module, specs }, 1);
    const parallel = await runGames({ module, specs }, 2);
    expect(parallel).toEqual(serial);
    expect(await runGames({ module, specs, fresh: true }, 2)).toEqual(serial);
    expect(serial.every(r => r.error === undefined && r.actions === 3 && r.result !== null)).toBe(true);
    expect(wholeGame({ records: serial, findings: [] }, { clauses: ['choose', 'pass', 'finish'] }).failures).toEqual([]);
    const out: string[] = [];
    expect(await fuzzMain(['--games', '2', '--workers', '2'], module, { whole: { clauses: ['choose', 'pass', 'finish'] } }, line => { out.push(line); })).toBe(0);
    expect(out).toContain('  -/-: 2 of 2 games finished');
  });

  it('keeps the existing GameRules path and an equivalent full-game kernelPort in agreement', async () => {
    const portGame: PortSimGame<Counter, { adds: number }> = {
      content: () => kernelGame.content(),
      port(spec, content) {
        const start = kernelGame.start(spec, content);
        const port = kernelPort(kernelGame.rules, content, { options: () => start.options, gameRules: start.rules });
        return { ...port, result: s => s.result };
      },
      answers: (s, _content, rng) => legalAnswers(s.prompt!, rng),
      driver: () => randomPortDriver<Counter>(),
      summary: s => ({ adds: s.marks.added.length }),
    };
    const content = await kernelGame.content();
    const kernel = specs.map(spec => playOne(kernelGame, content, spec));
    const ports = specs.map(spec => playOne(portGame, content, spec));
    for (let i = 0; i < kernel.length; i++) {
      const { triggerCapChecked, ...expected } = kernel[i]!;
      const { portExecution, ...actual } = ports[i]!;
      expect(triggerCapChecked).toBe(true); expect(portExecution).toBe(1);
      expect(actual).toEqual(expected);
    }
    expect(wholeGame({ records: ports, findings: [] })).toEqual(wholeGame({ records: kernel, findings: [] }));
  });

  it('uses only explicitly enumerated legal answers, with empty picks and repeated ordered picks intact', async () => {
    const pilot = randomPortDriver<PortGame>();
    const s = { phase: 0, pending: false, score: 0, seed: 's', secret: '', events: [] };
    const choices = [{ kind: 'answer' as const, promptId: 'string-id', picks: ['y', 'x', 'y'] }];
    expect(pilot.choose(s, choices, new DriverRng('s'))).toEqual(choices[0]);
    expect(() => pilot.choose(s, [], new DriverRng('s'))).toThrow('no legal answer');
    const out = await fuzz(module, { seed: 's', until: 2 });
    expect(out.findings).toEqual([]);
    expect(out.records[0]).toMatchObject({ actions: 2, result: null, summary: { phase: 2, score: 3 } });
    expect(wholeGame(out).groups[0]?.finished).toBe(0);
    expect(wholeGame(out, { clauses: ['never'] }).neverResolved).toEqual(['never']);
  });

  it.each(['false', 'zero'])('recognizes terminal %s through the actual result hook', async seed => {
    const run = await fuzz(module, { seed });
    expect(run.findings).toEqual([]);
    expect(run.records[0]?.result).toBe(seed === 'false' ? false : 0);
    expect(wholeGame(run).groups[0]?.finished).toBe(1);
  });

  it('preserves real engine rejection for stale ids and disabled answers and fails an empty enumeration', async () => {
    const content = await simGame.content();
    for (const answer of [
      { kind: 'answer' as const, promptId: 'stale', picks: ['x', 'y', 'x'] },
      { kind: 'answer' as const, promptId: 'choose:0', picks: ['disabled'] },
    ]) {
      const record = playOne({ ...simGame, driver: () => ({ name: 'bad', choose: () => answer, reasons: () => [] }) }, content, specs[0]!);
      expect(record).toMatchObject({ result: null, error: 'illegal port answer', actions: 1, log: [answer] });
    }
    const empty = playOne({ ...simGame, answers: () => [] }, content, specs[0]!);
    expect(empty).toMatchObject({ result: null, actions: 0, log: [] });
    expect(empty.error).toContain('dead end: no legal answer');
  });

  it.each([
    ['refuse', 'port refused the actual answer', 1],
    ['no-prompt', 'no prompt is open and the game has no result', 0],
    ['no-result', 'no prompt is open and the game has no result', 3],
    ['stall', 'no result after 4 actions', 4],
  ] as const)('reports actual port failure %s with a replay log', async (seed, message, actions) => {
    const run = await fuzz(module, { seed });
    expect(run.records[0]).toMatchObject({ result: null, error: message, actions, seed });
    expect(run.records[0]?.log).toHaveLength(actions);
    expect(run.findings).toHaveLength(1);
    expect(wholeGame(run).groups[0]?.finished).toBe(0);
  });

  it.each([['bad-setup', 0], ['bad-step', 1]] as const)('reports settled %s invariant findings', async (seed, actions) => {
    const run = await fuzz(module, { seed, workers: 2 });
    expect(run.records[0]).toMatchObject({ result: null, actions, violations: [{ id: 'port-state' }] });
    expect(run.records[0]?.log).toHaveLength(actions);
    expect(run.findings[0]?.kind).toBe('violation');
  });

  it('snapshots mutable input for transition and changed-clause evidence and checks the port-bound content', async () => {
    const content = await simGame.content(), ownContent = { resolved: new Set<string>() };
    const states: [number, number][] = [];
    const game: PortSimGame<PortGame> = {
      ...simGame,
      port(spec) {
        const port = simGame.port(spec, ownContent);
        return { ...port, invariants: (_s, checked) => { expect(checked).toBe(ownContent); return []; } };
      },
      trace: () => ({ resolved: ownContent.resolved, clear: () => ownContent.resolved.clear() }),
      transitionInvariants(before, after) {
        states.push([before.phase, after.phase]);
        expect(before).not.toBe(after);
        return [{ id: 'port-transition', message: 'actual transition rejected' }];
      },
    };
    const was = isChecking(); setInvariantChecking(true);
    try {
      const result = playOne(game, content, { ...specs[0]!, seed: 'mutable' });
      expect(states).toEqual([[0, 1]]);
      expect(result).toMatchObject({ result: null, actions: 1, violations: [{ id: 'port-transition' }], resolved: ['choose'] });
    } finally { setInvariantChecking(was); }
  });

  it('refuses missing capabilities and kernel-only options before running the engine', async () => {
    const content = await simGame.content();
    const noAnswers = { ...simGame }; Reflect.deleteProperty(noAnswers, 'answers');
    expect(playOne(noAnswers, content, specs[0]!).error).toMatch(/explicit legal answers/);
    const noResult = { ...simGame, port: (spec: typeof specs[number], value: typeof content) => {
      const port = simGame.port(spec, value); Reflect.deleteProperty(port, 'result'); return port;
    } };
    expect(playOne(noResult, content, specs[0]!).error).toMatch(/full-game result/);
    for (const opts of [{ hidden: true }, { debug: 1 }, { hasten: 1 }]) {
      const port = vi.fn((spec: typeof specs[number], value: typeof content) => simGame.port(spec, value));
      const result = playOne({ ...simGame, port }, content, specs[0]!, undefined, opts);
      expect(result).toMatchObject({ actions: 0, result: null });
      expect(result.error).toContain('does not support');
      expect(port).not.toHaveBeenCalled();
    }
  });

  it('refuses an explicit kernel undoCheck on a structural port module before setup', async () => {
    const content = await simGame.content();
    const port = vi.fn((spec: typeof specs[number], value: typeof content) => simGame.port(spec, value));
    const game = { ...simGame, port, undoCheck: true };
    const result = playOne(game, content, specs[0]!);
    expect(result).toMatchObject({ actions: 0, result: null });
    expect(result.error).toContain('does not support undoCheck');
    expect(port).not.toHaveBeenCalled();
  });

  it('validates both snapshots and the exact view a bot consumes, even when its caller catches rejection', async () => {
    const content = await simGame.content();
    expect(playOne(simGame, content, specs[0]!, undefined, { view: true }).viewValidation).toMatchObject({ status: 'executed', checked: 4, scope: 'snapshots-and-driver-views' });
    const noView = { ...simGame }; Reflect.deleteProperty(noView, 'view');
    expect(playOne(noView, content, specs[0]!, undefined, { view: true }).viewValidation).toEqual({ status: 'unavailable', checked: 0 });
    const choose = vi.fn((_view: unknown, legal: readonly { kind: 'answer'; promptId: string | number; picks: readonly string[] }[]) => legal[0]!);
    for (const catches of [false, true]) {
      const result = playOne({ ...simGame, driver: () => {
        const bot = portBotDriver<PortGame, unknown>({ name: 'bot', choose }, s => ({ secret: s.secret }), () => 'actor');
        return catches ? { ...bot, choose: (...args: Parameters<typeof bot.choose>) => { try { return bot.choose(...args); } catch { return args[1][0]!; } } } : bot;
      } }, content, specs[0]!, undefined, { view: true });
      expect(result.error).toMatch(/view leak/);
      expect(result.viewValidation?.status).toBe('failed');
      expect(result.actions).toBe(0);
    }
    expect(choose).not.toHaveBeenCalled();
    expect(playOne({ ...simGame, view: () => new Date() }, content, specs[0]!, undefined, { view: true }).error).toMatch(/JSON data/);
  });

  it('returns null on summary failure and preserves the real input seed when replayed', async () => {
    const content = await simGame.content();
    const record = playOne({ ...simGame, summary: () => { throw new Error('summary failed'); } }, content, specs[0]!);
    expect(record).toMatchObject({ result: null, error: 'summary: summary failed', actions: 3 });
    expect(record.log).toHaveLength(3);
    const request = { module, specs: [{ ...specs[1]!, index: 7 }] };
    const replay = await runGames(request, 1);
    const original = (await runGames({ module, specs }, 2))[1]!;
    expect(replay[0]).toEqual({ ...original, index: 7 });
  });

  it('asserts actual Node command exits for clean games, findings, incomplete coverage and bad registration/usage', () => {
    const index = new URL('./index.ts', import.meta.url).href;
    const command = (args: string[], clauses = ['choose', 'pass', 'finish']) => spawnSync(process.execPath, ['--input-type=module', '-e',
      `import {fuzzMain} from ${JSON.stringify(index)};process.exitCode=await fuzzMain(process.argv.slice(1),${JSON.stringify(module)},{whole:{clauses:${JSON.stringify(clauses)}}});`, '--', ...args], { encoding: 'utf8' });
    for (const [args, status] of [[['--seed', 'a'], 0], [['--seed', 'refuse'], 1], [['--seed', 'bad-step'], 1], [['--driver', 'unknown'], 2], [['--games', 'invalid'], 2]] as const) {
      const run = command([...args]);
      expect(run.status, run.stdout + run.stderr).toBe(status);
    }
    const missing = command(['--seed', 'a'], ['never']);
    expect(missing.status).toBe(1);
    expect(missing.stdout).toContain('never resolved: never');
  });
});
