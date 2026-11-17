import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HOST, loadLocal, allowedHosts, cmdlineMatches, descendantOf, lockIsHeld, originAllowed, safeRel, gitSteps, portsMd, killArgs, mappingPresent, publicUrl, startCommand, tailscaleServeArgs, validatePorts, nextSlot, addGameText } from './lib.mjs';

const cfg = JSON.parse(readFileSync(new URL('../../ports.json', import.meta.url), 'utf8'));
const g = (block, local, https) => ({ name: 'X', repo: 'r', block, serve: { local, https, build: 'b', start: 'x {port}', copyIgnored: [] } });
const P = { local: 4170, https: 8440 };

describe('validatePorts', () => {
  it('accepts the real ports.json', () => expect(validatePorts(cfg)).toEqual([]));
  it('rejects overlapping blocks', () => {
    expect(validatePorts({ panel: P, games: { a: g(6010, 4176, 8445), b: g(6015, 4177, 8446) } }).length).toBeGreaterThan(0);
  });
  it('rejects serve.local inside a block', () => {
    expect(validatePorts({ panel: P, games: { a: g(6010, 6012, 8445) } }).join()).toMatch(/inside block/);
  });
  it('rejects duplicate https and panel port clash', () => {
    expect(validatePorts({ panel: P, games: { a: g(6010, 4176, 8440) } }).join()).toMatch(/https 8440/);
    expect(validatePorts({ panel: P, games: { a: g(6010, 4170, 8445) } }).join()).toMatch(/already used/);
  });
});

describe('commands', () => {
  it('builds them', () => {
    expect(startCommand({ start: 'v --port {port}', local: 4176 })).toBe('v --port 4176');
    expect(tailscaleServeArgs(8445, 4176)).toEqual(['serve', '--bg', '--https=8445', 'http://127.0.0.1:4176']);
    expect(killArgs('12; rm')).toEqual(['/PID', 'NaN', '/T', '/F']);
    expect(publicUrl(443)).toBe(`https://${HOST}`);
    expect(publicUrl(8445)).toMatch(/:8445$/);
    expect(mappingPresent({ Web: { 'h.ts.net:8445': { Handlers: { '/': { Proxy: 'http://127.0.0.1:4176' } } } } }, 8445, 4176)).toBe(true);
    expect(mappingPresent({ Web: { 'h.ts.net:8445': { Handlers: { '/': { Proxy: 'http://127.0.0.1:9999' } } } } }, 8445, 4176)).toBe(false);
    expect(gitSteps()[1]).toEqual(['reset', '--hard', 'origin/main']);
  });
});

describe('docs/PORTS.md', () => {
  it('matches ports.json', () => expect(readFileSync(new URL('../../docs/PORTS.md', import.meta.url), 'utf8')).toBe(portsMd(cfg)));
  it('rejects phone port outside 4170-4199', () => expect(validatePorts({ panel: P, games: { a: g(6010, 4200, 8445) } }).join()).toMatch(/4170-4199/));
});

describe('safety', () => {
  it('rejects unsafe copyIgnored and cwd', () => {
    for (const bad of ['C:/x', '/x', '\\x', '../x', 'a/../b', 'a\\..\\b', '']) expect(safeRel(bad)).toBe(false);
    expect(safeRel('public/scans')).toBe(true);
    const a = g(6010, 4176, 8445);
    a.serve.copyIgnored = ['../secret'];
    expect(validatePorts({ panel: P, games: { a } }).join()).toMatch(/must be relative/);
    const b = g(6010, 4176, 8445);
    b.serve.cwd = 'D:/x';
    expect(validatePorts({ panel: P, games: { b } }).join()).toMatch(/must be relative/);
  });
  it('lock is held only while its pid is alive', () => {
    const t = JSON.stringify({ pid: 5, time: 1 });
    expect(lockIsHeld(t, (p) => p === 5)).toBe(true);
    expect(lockIsHeld(t, () => false)).toBe(false);
    expect(lockIsHeld('garbage', () => true)).toBe(false);
  });
  it('checks origin and host', () => {
    const c = { panel: P };
    expect(allowedHosts(c).size).toBe(2);
    expect(originAllowed({ host: '127.0.0.1:4170' }, c)).toBe(true);
    expect(originAllowed({ host: `${HOST}:8440`, origin: `https://${HOST}:8440` }, c)).toBe(true);
    expect(originAllowed({ host: '127.0.0.1:4170', origin: 'https://evil.example' }, c)).toBe(false);
    expect(originAllowed({ host: 'evil.example' }, c)).toBe(false);
  });
  it('matches command lines and process trees', () => {
    expect(cmdlineMatches('cmd.exe /c "npx vite preview --port 1"', 'npx vite preview --port 1')).toBe(true);
    expect(cmdlineMatches('notepad.exe', 'npx vite')).toBe(false);
    const ps = [{ ProcessId: 2, ParentProcessId: 1 }, { ProcessId: 3, ParentProcessId: 2 }, { ProcessId: 9, ParentProcessId: 8 }];
    expect(descendantOf(ps, 3, 1)).toBe(true);
    expect(descendantOf(ps, 9, 1)).toBe(false);
  });
});

describe('loadLocal (K259)', () => {
  it('defaults when the file is absent, values when present', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'k259-')), 'kit.local.json');
    expect(loadLocal(f)).toMatchObject({ host: 'localhost', serveRoot: expect.stringMatching(/\/_serve$/) });
    writeFileSync(f, JSON.stringify({ host: 'h.ts.net', serveRoot: 'D:/s' }));
    expect(loadLocal(f)).toEqual({ host: 'h.ts.net', serveRoot: 'D:/s' });
  });
});

describe('add a game', () => {
  const text = readFileSync(new URL('../../ports.json', import.meta.url), 'utf8');
  it('picks the next free block and serve slots', () => {
    const s = nextSlot(cfg);
    expect(s.block).toBe(Math.max(...Object.values(cfg.games).map((x) => x.block)) + 10);
    expect(Object.values(cfg.games).some((x) => x.serve.local === s.local || x.serve.https === s.https)).toBe(false);
    expect(nextSlot({ panel: P, games: { a: g(5180, 4171, 8441) } })).toEqual({ block: 6010, local: 4172, https: 8442 });
  });
  it('adds one valid line and keeps the rest', () => {
    const s = nextSlot(cfg);
    const out = addGameText(text, 'newgame', g(s.block, s.local, s.https));
    expect(validatePorts(JSON.parse(out))).toEqual([]);
    expect(out.split('\n').length).toBe(text.split('\n').length + 1);
    expect(() => addGameText(text, 'rome', g(s.block, s.local, s.https))).toThrow();
  });
});
