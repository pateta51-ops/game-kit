import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { hashInputs, run, type Deps } from './launch.ts';

const root = mkdtempSync(join(tmpdir(), 'launch-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(root, 'src'));
writeFileSync(join(root, 'src', 'a.txt'), 'one');
const log: string[] = [];
const deps: Deps = {
  build: (c) => (log.push(`build ${c}`), 0),
  serve: (c) => (log.push(`serve ${c}`), Promise.resolve(0)),
  open: (u) => void log.push(`open ${u}`),
};
const io = { out: () => undefined, err: () => undefined };
const args = ['--root', root, '--input', 'src', '--build', 'B', '--serve', 'S {port}', '--port', '7001'];
const go = async (): Promise<string[]> => {
  log.length = 0;
  expect(await run(args, io, deps)).toBe(0);
  return [...log];
};

describe('launch', () => {
  it('missing stamp rebuilds, serves on the given port and opens', async () => {
    expect(await go()).toEqual(['build B', 'open http://localhost:7001', 'serve S 7001']);
  });
  it('unchanged inputs reuse the build', async () => {
    expect((await go()).some((l) => l.startsWith('build'))).toBe(false);
  });
  it('a changed input rebuilds', async () => {
    writeFileSync(join(root, 'src', 'a.txt'), 'two');
    expect((await go())[0]).toBe('build B');
    expect((await go())[0]).not.toBe('build B');
  });
  it('a failed build is not reused and needs a port', async () => {
    writeFileSync(join(root, 'src', 'a.txt'), 'three');
    const bad = { ...deps, build: () => 3 };
    expect(await run(args, io, bad)).toBe(3);
    expect((await go())[0]).toBe('build B');
    expect(await run(['--input', 'src'], io, deps)).toBe(2);
  });
  it('--built missing forces a rebuild; --no-open skips open; extra args follow --; stamp folder is created', async () => {
    const r = mkdtempSync(join(tmpdir(), 'launch2-'));
    writeFileSync(join(r, 'a.txt'), 'x');
    const a = ['--root', r, '--input', 'a.txt', '--build', 'B', '--serve', 'S {port}', '--port', '7002', '--stamp', 'out/.stamp', '--built', 'out/index.html', '--no-open'];
    log.length = 0;
    expect(await run([...a, '--', '--host'], io, deps)).toBe(0);
    expect(log).toEqual(['build B', 'serve S 7002 --host']);
    log.length = 0;
    await run(a, io, deps);
    expect(log[0]).toBe('build B');
    writeFileSync(join(r, 'out', 'index.html'), '');
    log.length = 0;
    await run(a, io, deps);
    expect(log).toEqual(['serve S 7002']);
    rmSync(r, { recursive: true, force: true });
  });
  it('input order does not change the hash', () => {
    mkdirSync(join(root, 'src2'), { recursive: true });
    writeFileSync(join(root, 'src2', 'b.txt'), 'b');
    expect(hashInputs(root, ['src', 'src2'])).toBe(hashInputs(root, ['src2', 'src']));
  });
});
