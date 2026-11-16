import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { run as bundle } from './bundle-node.ts';
import { filesToCopy, run as sync, syncNote } from './dossier-sync.ts';
import { looksLikeFont, ownerFiles, run as fonts } from './fonts-fetch.ts';
import { run as mocks, type Playwright } from './mock-capture.ts';
import { run as shrinkRun } from './shrink-png.ts';
import { toWoff } from './woff.ts';

const dir = mkdtempSync(join(tmpdir(), 'tooling-more-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const lines: string[] = [];
const io = { out: (l: string) => void lines.push(l), err: (l: string) => void lines.push(l) };
const sub = (name: string) => {
  mkdirSync(join(dir, name), { recursive: true });
  return join(dir, name);
};

/** A two-table SFNT: one table that deflates, one that does not. */
function ttf(): Buffer {
  const a = Buffer.from([7, 201, 33, 148, 90]);
  const z = Buffer.alloc(2000, 65);
  const b = Buffer.alloc(12 + 32 + 2000 + 8);
  b.writeUInt32BE(0x00010000, 0);
  b.writeUInt16BE(2, 4);
  b.write('zzzz', 12);
  b.writeUInt32BE(111, 16);
  b.writeUInt32BE(44, 20);
  b.writeUInt32BE(2000, 24);
  b.write('aaaa', 28);
  b.writeUInt32BE(222, 32);
  b.writeUInt32BE(2044, 36);
  b.writeUInt32BE(5, 40);
  z.copy(b, 44);
  a.copy(b, 2044);
  return b;
}

describe('woff', () => {
  it('keeps every table and checksum, sorted by tag, compressed only when smaller', () => {
    const source = ttf();
    const woff = toWoff(source);
    expect(woff.toString('ascii', 0, 4)).toBe('wOFF');
    expect(woff.readUInt32BE(4)).toBe(source.readUInt32BE(0));
    expect(woff.readUInt32BE(8)).toBe(woff.length);
    expect(woff.readUInt16BE(12)).toBe(2);
    expect(woff.toString('ascii', 44, 48)).toBe('aaaa');
    for (let i = 0; i < 2; i++) {
      const input = 12 + i * 16;
      const tag = source.toString('ascii', input, input + 4);
      const entry = [44, 64].find((at) => woff.toString('ascii', at, at + 4) === tag) ?? 0;
      const offset = woff.readUInt32BE(entry + 4);
      const compressed = woff.readUInt32BE(entry + 8);
      const original = woff.readUInt32BE(entry + 12);
      const data = woff.subarray(offset, offset + compressed);
      expect(offset % 4).toBe(0);
      expect(compressed < original).toBe(tag === 'zzzz');
      expect(woff.readUInt32BE(entry + 16)).toBe(source.readUInt32BE(input + 4));
      const start = source.readUInt32BE(input + 8);
      expect(Buffer.compare(compressed < original ? inflateSync(data) : data, source.subarray(start, start + source.readUInt32BE(input + 12)))).toBe(0);
    }
    expect(() => toWoff(source.subarray(0, 100))).toThrow(/beyond/);
  });
});

describe('fonts-fetch', () => {
  it('downloads substitutes as WOFF with their licence, lets owner files take a role, keeps present files', async () => {
    const out = sub('fonts');
    const icon = join(dir, 'icons.ttf');
    writeFileSync(icon, 'icons');
    const roles = join(dir, 'roles.json');
    const role = (name: string, files: string[]) => ({
      role: name,
      family: `Game ${name}`,
      printed: `Printed ${name}`,
      ownerPrefix: `Owner${name}`,
      substitute: { family: `Free ${name}`, licence: 'OFL 1.1', licenceFile: `${name}-OFL.txt`, licenceUrl: `https://fonts.invalid/${name}/OFL.txt`, files: files.map((file) => ({ file, url: `https://fonts.invalid/${name}/${file}` })) },
    });
    writeFileSync(roles, JSON.stringify({ roles: [role('body', ['Body.woff', 'Body-Italic.ttf']), role('heading', ['Heading.woff'])], copy: [{ from: icon, note: 'private use' }] }));
    writeFileSync(join(out, 'Ownerheading-Regular.woff2'), 'x');
    const asked: string[] = [];
    const get = (url: string) => {
      asked.push(url);
      if (url.includes('heading/Heading')) return Promise.reject(new Error('offline'));
      return Promise.resolve(url.endsWith('.txt') ? new TextEncoder().encode('licence') : new Uint8Array(ttf()));
    };
    expect(await fonts(['--roles', roles, '--out', out], io, get)).toBe(1);
    expect(lines.join('\n')).toContain('offline');
    expect(readFileSync(join(out, 'Body.woff')).toString('ascii', 0, 4)).toBe('wOFF');
    expect(Buffer.compare(readFileSync(join(out, 'Body-Italic.ttf')), ttf())).toBe(0);
    expect(readFileSync(join(out, 'body-OFL.txt'), 'utf8')).toBe('licence');
    expect(readFileSync(join(out, 'icons.ttf'), 'utf8')).toBe('icons');
    const manifest = JSON.parse(readFileSync(join(out, 'fonts.json'), 'utf8')) as { roles: { source: string; files: string[] }[]; copied: string[] };
    expect(manifest.roles.map((r) => [r.source, r.files])).toEqual([
      ['substitute', ['Body.woff', 'Body-Italic.ttf']],
      ['owner', ['Ownerheading-Regular.woff2']],
    ]);
    expect(manifest.copied).toEqual(['icons.ttf']);
    expect(readFileSync(join(out, 'LICENSES.md'), 'utf8')).toContain('| `Body.woff` (Free body) | body | Printed body | OFL 1.1; text in `body-OFL.txt` |');
    asked.length = 0;
    await fonts(['--roles', roles, '--out', out], io, get);
    expect(asked).toEqual(['https://fonts.invalid/heading/Heading.woff']);
    await fonts(['--roles', roles, '--out', out, '--force'], io, get);
    expect(asked.length).toBe(5);
    expect(await fonts(['--roles', roles, '--out', out, '--force'], io, () => Promise.resolve(new Uint8Array(2000)))).toBe(1);
    expect(await fonts(['--out', out], io, get)).toBe(2);
    for (const bad of ['./evil.woff', join(dir, 'evil.woff'), 'a/./././evil.woff'].map((p) => p.replaceAll('./', '.'.repeat(2) + '/'))) {
      for (const cfg of [{ roles: [role('body', [bad])] }, { roles: [{ ...role('body', []), substitute: { ...role('body', []).substitute, licenceFile: bad } }] }]) {
        writeFileSync(roles, JSON.stringify(cfg));
        lines.length = 0;
        expect(await fonts(['--roles', roles, '--out', out, '--force'], io, get)).toBe(2);
        expect(lines[0]).toContain('must stay inside');
      }
    }
    expect(existsSync(join(dir, 'evil.woff'))).toBe(false);
    expect(looksLikeFont(new Uint8Array(ttf()))).toBe(true);
    expect(ownerFiles(out, undefined)).toEqual([]);
  });
});

describe('shrink-png', () => {
  it('re-encodes only the PNGs over the limit, with fewer colours until one fits', async () => {
    const d = sub('shots');
    writeFileSync(join(d, 'small.png'), Buffer.alloc(50));
    writeFileSync(join(d, 'big.png'), Buffer.alloc(1000));
    writeFileSync(join(d, 'huge.PNG'), Buffer.alloc(5000));
    writeFileSync(join(d, 'big.txt'), Buffer.alloc(1000));
    const calls: number[] = [];
    const encode = (png: Uint8Array, colours: number) => {
      calls.push(colours);
      return Promise.resolve(new Uint8Array((png.length * colours) / 1280));
    };
    lines.length = 0;
    expect(await shrinkRun(['--dir', d, '--max-bytes', '100', '--colours', '256,128'], io, encode)).toBe(1);
    expect(calls).toEqual([256, 128, 256, 128]);
    expect(readFileSync(join(d, 'small.png')).length).toBe(50);
    expect(readFileSync(join(d, 'big.png')).length).toBe(100);
    expect(readFileSync(join(d, 'huge.PNG')).length).toBe(500);
    expect(readFileSync(join(d, 'big.txt')).length).toBe(1000);
    expect(lines).toEqual(['big.png: 1000 -> 100 bytes', 'huge.PNG: 5000 -> 500 bytes', 'error: huge.PNG is still over 100 bytes']);
    expect(await shrinkRun(['--dir', d, '--max-bytes', '500'], io, encode)).toBe(0);
    expect(await shrinkRun(['--dir', d, '--colours', '999'], io, encode)).toBe(2);
    expect(await shrinkRun([], io, encode)).toBe(2);
  });
});

describe('dossier-sync', () => {
  it('leaves out the excluded files and names the source commit', () => {
    expect(filesToCopy(['README.md', 'docs/OLD.md', 'docs/log.md', ''], ['docs/OLD.md'])).toEqual(['README.md', 'docs/log.md']);
    const note = syncNote({ name: 'the dossier', commit: 'a'.repeat(40), subject: 'Add rulings', branch: 'main' }, 12, ['docs/OLD.md']);
    expect(note).toContain('a'.repeat(40));
    expect(note).toContain('Files copied: 12');
    expect(note).toContain('Left out: `docs/OLD.md`');
    expect(syncNote({ name: 'x', commit: 'c', subject: 's', branch: 'b' }, 1, [])).not.toContain('Left out');
  });

  it('copies a clean checkout, replaces the old copy, and refuses a dirty one or a folder that is not a checkout', () => {
    const source = sub('dossier-src');
    const git = (...args: string[]): void => void execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@invalid', ...args], { cwd: source, stdio: 'ignore' });
    git('init', '-q');
    mkdirSync(join(source, 'docs'));
    writeFileSync(join(source, 'rulings.md'), '# rulings\n');
    writeFileSync(join(source, 'docs', 'OLD.md'), 'stale\n');
    writeFileSync(join(source, 'untracked.md'), 'x');
    git('add', 'rulings.md', 'docs');
    git('commit', '-q', '-m', 'first');
    const target = join(dir, 'game', 'dossier');
    const args = ['--source', source, '--target', target, '--exclude', 'docs/OLD.md', '--name', 'the dossier'];
    expect(sync(args, io)).toBe(0);
    expect(readFileSync(join(target, 'rulings.md'), 'utf8')).toBe('# rulings\n');
    expect(existsSync(join(target, 'docs', 'OLD.md'))).toBe(false);
    expect(existsSync(join(target, 'untracked.md'))).toBe(false);
    expect(readFileSync(join(target, 'SYNC.md'), 'utf8')).toContain('Files copied: 1');
    writeFileSync(join(target, 'old.md'), 'x');
    expect(sync(args, io)).toBe(0);
    expect(existsSync(join(target, 'old.md'))).toBe(false);
    writeFileSync(join(source, 'rulings.md'), '# changed\n');
    expect(sync(args, io)).toBe(2);
    expect(sync(['--source', join(source, 'docs'), '--target', target], io)).toBe(2);
    expect(sync(['--source', source], io)).toBe(2);
    git('checkout', '-q', 'rulings.md');
    for (const bad of [source, dirname(source), process.cwd(), dirname(process.cwd()), homedir(), parse(source).root]) {
      lines.length = 0;
      expect(sync(['--source', source, '--target', bad], io)).toBe(2);
      expect(lines[0]).toContain('refusing');
    }
    expect(existsSync(join(source, 'untracked.md'))).toBe(true);
    writeFileSync(join(dir, 'outside.md'), 'secret');
    symlinkSync(join(dir, 'outside.md'), join(source, 'link.md'));
    git('add', 'link.md');
    git('commit', '-q', '-m', 'link');
    expect(sync(args, io)).toBe(0);
    expect(existsSync(join(target, 'link.md'))).toBe(false);
    expect(readFileSync(join(target, 'rulings.md'), 'utf8')).toBe('# rulings\n');
  });
});

describe('bundle-node', () => {
  it('bundles entries to .mjs that plain node runs, without the keep-names helper', async () => {
    const root = sub('bundle');
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts', 'lib.ts'), 'export const twice = (n: number): number => n * 2;\n');
    writeFileSync(join(root, 'scripts', 'sim.ts'), "import { twice } from './lib';\nconst named = function (): number { return twice(21); };\nconsole.log(named());\n");
    expect(await bundle(['--entry', 'scripts/sim.ts', '--outdir', '.bundle/node', '--root', root], io)).toBe(0);
    const out = join(root, '.bundle', 'node', 'sim.mjs');
    expect(readFileSync(out, 'utf8')).not.toContain('__name');
    expect(spawnSync(process.execPath, [out], { encoding: 'utf8' }).stdout.trim()).toBe('42');
    expect(await bundle(['--entry', 'scripts/none.ts', '--outdir', '.bundle/node', '--root', root], io)).toBe(2);
    expect(await bundle(['--outdir', 'x'], io)).toBe(2);
  });
});

describe('mock-capture', () => {
  it('captures the listed mocks, reports their defects, and --only keeps the rest of the report', async () => {
    const src = sub('mocks-src');
    const out = join(dir, 'mocks-out');
    const list = join(dir, 'mocks.json');
    writeFileSync(list, JSON.stringify([{ name: 'home', file: 'home.html' }, { name: 'sub/table', file: 'table.html', query: '?s=2', width: 800, height: 600, deviceScaleFactor: 2, fullPage: true }]));
    const seen: unknown[] = [];
    let closed = 0;
    const pw: Playwright = {
      chromium: {
        launch: () =>
          Promise.resolve({
            newContext: (o: object) => {
              let url = '';
              let n = 0;
              const on: Record<string, (e: { message: string; type(): string; text(): string; url(): string }) => void> = {};
              return Promise.resolve({
                close: () => Promise.resolve(),
                newPage: () =>
                  Promise.resolve({
                    on: (ev: string, fn: (typeof on)[string]) => void (on[ev] = fn),
                    goto: (u: string) => {
                      url = u;
                      seen.push([u.replace(/^.*\//, ''), o]);
                      if (u.includes('table')) {
                        const e = { message: 'boom', type: () => 'error', text: () => 'console boom', url: () => 'file:///missing.png' };
                        for (const k of ['pageerror', 'console', 'requestfailed']) on[k]?.(e);
                        on['console']?.({ ...e, type: () => 'log' });
                      }
                      return Promise.resolve();
                    },
                    waitForLoadState: () => Promise.resolve(),
                    waitForTimeout: (ms: number) => Promise.resolve(void seen.push(ms)),
                    evaluate: <T>() => {
                      n += 1;
                      return Promise.resolve((n === 1 ? null : n === 2 ? (url.includes('table') ? ['file:///x.png'] : []) : ['Serif', 'Serif', 'Sans']) as T);
                    },
                    screenshot: (s: { path: string; fullPage: boolean }) => {
                      writeFileSync(s.path, url.includes('table') ? 'tt' : 'h');
                      seen.push(s.fullPage);
                      return Promise.resolve();
                    },
                  }),
              });
            },
            close: () => Promise.resolve(void (closed += 1)),
          }),
      },
    };
    lines.length = 0;
    const args = ['--list', list, '--src', src, '--out', out, '--settle-ms', '5'];
    expect(await mocks(args, io, pw)).toBe(1);
    expect(lines).toEqual(['home: 1 bytes', 'sub/table: 2 bytes PROBLEMS']);
    expect(closed).toBe(1);
    expect(seen).toEqual([['home.html', { viewport: { width: 3840, height: 2160 } }], 5, false, ['table.html?s=2', { viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 }], 5, true]);
    const report = () => JSON.parse(readFileSync(join(out, 'capture-report.json'), 'utf8')) as Record<string, unknown>;
    expect(report()).toEqual({
      home: { errors: [], failed: [], broken: [], fonts: ['Serif', 'Sans'], bytes: 1 },
      'sub/table': { errors: ['boom', 'console boom'], failed: ['file:///missing.png'], broken: ['file:///x.png'], fonts: ['Serif', 'Sans'], bytes: 2 },
    });
    expect(readFileSync(join(out, 'sub', 'table.png'), 'utf8')).toBe('tt');
    lines.length = 0;
    expect(await mocks([...args, '--only', 'home'], io, pw)).toBe(1);
    expect(lines).toEqual(['home: 1 bytes']);
    expect(Object.keys(report())).toEqual(['home', 'sub/table']);
    writeFileSync(list, JSON.stringify([{ name: 'home', file: 'home.html' }, { name: 'w', file: 'w.html', browser: 'webkit' }]));
    expect(await mocks(args, io, pw)).toBe(2);
    expect(lines.at(-1)).toContain('no browser webkit');
    writeFileSync(list, JSON.stringify([{ name: 'home', file: 'home.html' }]));
    expect(await mocks(args, io, pw)).toBe(0);
    expect(Object.keys(report())).toEqual(['home']);
    expect(await mocks(['--list', list], io, pw)).toBe(2);
  });
});

describe('setup.ps1', () => {
  it('is ASCII, takes the game as parameters and names no game, owner or folder', () => {
    const text = readFileSync(fileURLToPath(new URL('./setup.ps1', import.meta.url)), 'utf8');
    expect(/^[\t\n\r\x20-\x7e]*$/.test(text)).toBe(true);
    for (const p of ['Name', 'RepoUrl', 'Dir', 'Marker', 'NodeMajor', 'Need', 'Build', 'Check', 'RunnerRepo', 'RunnerLabel', 'CheckOnly']) expect(text).toMatch(new RegExp(`\\]\\$${p}\\b`));
    expect(text).not.toMatch(/jarl|rome|warp|imperium|pateta|[A-Z]:\\(projects|Users)/i);
    expect(text).not.toContain('IndexOf($root');
    const stale = /\[regex\]::Escape\(\$root\.TrimEnd\('\\'\)\) \+ '(.+?)'\) \}\)/.exec(text)?.[1]?.replace("''", "'") ?? 'missing';
    const hit = (cmd: string) => new RegExp('C:\\\\a' + stale, 'i').test(cmd);
    expect([hit('node C:\\a\\x.js'), hit('node "C:\\a"'), hit('node C:\\a'), hit('node C:\\ab\\x.js'), hit('node "C:\\ab"')]).toEqual([true, true, true, false, false]);
    const safe = new RegExp(/\$safe = '(.+)'/.exec(text)?.[1] ?? 'missing');
    expect(['A=1', 'owner/repo', 'kit/ci-templates/install-wsl.sh', ''].every((v) => safe.test(v))).toBe(true);
    expect(['A=1;rm', 'a b', '$(x)', 'a`b', "a'b", 'a"b', 'a&b', 'a|b'].some((v) => safe.test(v))).toBe(false);
    expect(text).toMatch(/\$RunnerEnv -split ' '\) \| Where-Object \{ \$_ -cnotmatch \$safe \}/);
    expect(text.split('{').length).toBe(text.split('}').length);
  });
});
