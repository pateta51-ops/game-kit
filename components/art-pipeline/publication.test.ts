import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run as check } from '../tooling-scripts/art-check.ts';
import { run as publish } from './art-publish.ts';
import { encodePng, sha256 } from './lib.ts';
import { beginPublication } from './publication.ts';

let dir: string;
const messages: string[] = [];
const io = { out: (s: string) => { messages.push(s); }, err: (s: string) => { messages.push(s); } };
const picture = encodePng({ width: 1, height: 1, data: Buffer.from([1, 2, 3, 255]) });
const badDeflate = Buffer.from(picture);
badDeflate.fill(0, 41, badDeflate.length - 16);
badDeflate.writeUInt32BE(crc32(badDeflate.subarray(37, -16)), badDeflate.length - 16);
const put = (name: string, value: unknown) => {
  const file = join(dir, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value instanceof Uint8Array ? value : JSON.stringify(value));
  return file;
};
const config = (extra: object = {}) => put('publish.json', { index: 'index.json', root: 'source', stage: 'chosen', out: 'public/art', manifest: 'public/manifest.json', ext: 'png', ...extra });
const index = (defs: unknown) => put('index.json', { defs, sources: {}, missing: [], counts: {}, order: [] });
const snapshot = () => ['chosen/old.png', 'public/art/old.png', 'public/manifest.json'].map((p) => existsSync(join(dir, p)) ? readFileSync(join(dir, p)).toString('base64') : null);
const cli = (...args: string[]) => spawnSync(process.execPath, [fileURLToPath(new URL('./art-publish.ts', import.meta.url)), '--config', join(dir, 'publish.json'), ...args], { encoding: 'utf8' });
const checkArgs = () => ['--manifest', join(dir, 'public/manifest.json'), '--sources', join(dir, 'chosen'), '--out', join(dir, 'public/art'), '--ext', 'png'];

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'art-publication-'));
  messages.length = 0;
  put('source/a.png', picture);
  index({ old: 'a.png' });
  expect(await publish(['--config', config()], io)).toBe(0);
  messages.length = 0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('publication preserves usable art', () => {
  it('rejects colliding logical IDs through the CLI before replacing any prior file', () => {
    const old = snapshot();
    index({ 'a:b': 'a.png', 'a/b': 'a.png' });
    const result = cli();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('collision');
    expect(result.stderr).toContain('a:b');
    expect(result.stderr).toContain('a/b');
    expect(snapshot()).toEqual(old);
    expect(result.stdout).not.toContain('pictures to');
    expect(readFileSync(join(dir, 'source/a.png'))).toEqual(picture);
  });

  it('leaves the prior release byte-identical after a missing source', () => {
    const old = snapshot();
    index({ fresh: 'missing.png' });
    const result = cli();
    expect(result.status).toBe(2);
    expect(snapshot()).toEqual(old);
    expect(result.stdout).not.toContain('pictures to');
  });

  it.each(['<html>download failed</html>', '65504e470d0a1a0a'])('preserves the prior release when a passthrough PNG contains %s', (invalid) => {
    const old = snapshot();
    put('source/a.png', Buffer.from(invalid, invalid.startsWith('<') ? 'utf8' : 'hex'));
    const result = cli();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not a valid .png image');
    expect(snapshot()).toEqual(old);
  });

  it.each([
    ['png', Buffer.concat([picture.subarray(0, 33), picture.subarray(-12)])],
    ['png', badDeflate],
    ['webp', Buffer.from('524946461600000057454250565038580a00000000000000000000000000', 'hex')],
  ] as const)('preserves the old release when a .%s contains no valid image data', (ext, contents) => {
    const old = snapshot();
    put(`source/fresh.${ext}`, contents);
    index({ old: `fresh.${ext}` });
    config({ ext });
    const result = cli();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`not a valid .${ext} image`);
    expect(snapshot()).toEqual(old);
  });

  it.each([
    ['png', 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAAA1BMVEUAAACnej3aAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'],
    ['png', 'iVBORw0KGgoAAAANSUhEUgAAAAUAAAAHCAAAAAGSy+ikAAAANklEQVR4nAXBCQJAIAAAwXUViaKEkPT/R5oBWvxBTUDpmZQLVcM4se28H52Q/YCxy+o443U/Py8mAlQLCEpKAAAAAElFTkSuQmCC'],
    ['webp', 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAUAmJaQAA3AA/v02aAA='],
    ['webp', 'UklGRhoAAABXRUJQVlA4TA4AAAAvAUAAAAcQEf0PRET/Aw=='],
    ['webp', 'UklGRq4AAABXRUJQVlA4WAoAAAACAAAAAQAAAQAAQU5JTQYAAAAAAAAAAABBTk1GMAAAAAAAAAAAAAEAAAEAAMgAAAJWUDggGAAAADABAJ0BKgIAAgABQCYlpAADcAD+/TZoAEFOTUZKAAAAAAAAAAAAAQAAAQAAyAAAAFZQOCAyAAAANAEAnQEqAgACAAAAJiWgAANwAP7y63//+bA/9vP/BHoB///S4P/+lwf/9Lg/9KQAAAA='],
  ])('accepts real indexed, lossy, lossless and animated image variants (%s)', (ext, contents) => {
    const bytes = Buffer.from(contents, 'base64');
    put(`source/fresh.${ext}`, bytes);
    index({ old: `fresh.${ext}` });
    config({ ext });
    const result = cli();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(dir, `public/art/old.${ext}`))).toEqual(bytes);
  });

  it('normalizes the codec format for an uppercase output suffix', () => {
    put('source/extensionless', picture);
    index({ old: 'extensionless' });
    config({ ext: 'PNG' });
    const result = cli();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(dir, 'public/art/old.PNG'))).toEqual(picture);
  });

  it.each([[{}], [[]], [null]])('refuses an empty or malformed selection without clearing the prior release: %j', async (defs) => {
    const old = snapshot();
    index(defs);
    expect(await publish(['--config', config()], io)).toBe(2);
    expect(snapshot()).toEqual(old);
  });

  it('preserves previous output and sources after encoder and quality failures', async () => {
    const old = snapshot();
    index({ fresh: 'a.png' });
    expect(await publish(['--config', config({ ext: 'jpg' })], io, { out: () => Promise.reject(new Error('encoder failed')) })).toBe(2);
    expect(snapshot()).toEqual(old);
    expect(await publish(['--config', config({ ext: 'jpg', quality: { min: 90 }, maxFileBytes: 2 })], io, { out: () => Promise.resolve(Buffer.alloc(10)) })).toBe(2);
    expect(snapshot()).toEqual(old);
    expect(readFileSync(join(dir, 'source/a.png'))).toEqual(picture);
  });

  it('replaces all outputs only after success and checks independently supplied logical IDs', async () => {
    index({ 'a:b': 'a.png' });
    expect(await publish(['--config', config()], io)).toBe(0);
    expect(readdirSync(join(dir, 'chosen'))).toEqual(['a_b.png']);
    expect(readdirSync(join(dir, 'public/art'))).toEqual(['a_b.png']);
    expect(check([...checkArgs(), '--need', put('names.json', ['a_b'])], io)).toBe(0);
    expect(check([...checkArgs(), '--need-ids', put('ids.json', ['a:b'])], io)).toBe(0);
    expect(check([...checkArgs(), '--need-ids', put('ids.json', ['a:b', 'a/b'])], io)).toBe(1);
    expect(messages.join('\n')).toContain('a/b: required logical ID');
  });

  it('supports a manifest inside the output directory without losing identity metadata', async () => {
    index({ a: 'a.png' });
    expect(await publish(['--config', config({ manifest: 'public/art/manifest.json' })], io)).toBe(0);
    expect(check(['--manifest', join(dir, 'public/art/manifest.json'), '--sources', join(dir, 'chosen'), '--out', join(dir, 'public/art'), '--ext', 'png', '--need-ids', put('ids.json', ['a'])], io)).toBe(0);
  });

  it('verifies a generic source filename without an extension through the default check', async () => {
    put('source/extensionless', picture);
    index({ face: 'extensionless' });
    expect(await publish(['--config', config()], io)).toBe(0);
    expect(check([...checkArgs(), '--need-ids', put('ids.json', ['face'])], io)).toBe(0);
  });

  it('fails when a required legacy face output is a directory', () => {
    const output = join(dir, 'public/art/old.png');
    rmSync(output);
    mkdirSync(output);
    put('public/manifest.json', { old: { id: 'old', source: 'old.png', sha256: sha256(picture), bytes: statSync(output).size } });
    expect(check([...checkArgs(), '--need', put('names.json', ['old']), '--need-ids', put('ids.json', ['old'])], io)).toBe(1);
    expect(messages.join('\n')).toContain('required logical ID has no complete published face');
  });

  it.each(['chosen/manifest.json', 'chosen/metadata.v1/manifest.json', 'public/art/manifest.png', 'public/art/metadata.png/manifest.json'])('publishes and checks an in-directory manifest without counting it as art: %s', async (manifest) => {
    index({ face: 'a.png' });
    expect(await publish(['--config', config({ manifest })], io)).toBe(0);
    expect(check([
      '--manifest', join(dir, manifest), '--sources', join(dir, 'chosen'), '--out', join(dir, 'public/art'),
      '--ext', 'png', '--max-bytes', String(picture.length), '--max-file-bytes', String(picture.length),
    ], io)).toBe(0);
    expect(messages.join('\n')).toContain(`ok (1 faces, ${String(picture.length)} bytes)`);
  });

  it.skipIf(process.platform !== 'win32').each([
    { manifest: 'PUBLIC/ART/OLD.PNG' },
    { manifest: 'CHOSEN/OLD.PNG.' },
    { out: 'CHOSEN.PUBLISH-NEXT' },
  ])('rejects Windows path aliases before replacing a release: %j', (paths) => {
    const old = snapshot();
    config(paths);
    const result = cli();
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/manifest would replace face|paths must not overlap|ambiguous Windows publication path/);
    expect(snapshot()).toEqual(old);
  });

  it.each([{ out: 'source' }, { out: 'chosen.publish-backup' }, { manifest: 'public' }, { manifest: 'public/art/old.png' }])('refuses destructive path overlap: %j', async (paths) => {
    const old = snapshot();
    expect(await publish(['--config', config(paths)], io)).toBe(2);
    expect(snapshot()).toEqual(old);
    expect(readFileSync(join(dir, 'source/a.png'))).toEqual(picture);
  });

  it.each([
    { manifest: 'publish.json.publish-state.json' },
    { manifest: 'publish.json.publish-state.json.tmp' },
    { out: 'publish.json.publish-state.json' },
    { out: 'publish.json.publish-state.json.tmp' },
    { manifest: 'publish.json.publish-state.json/manifest.json' },
    { out: 'publish.json.publish-state.json.tmp/art' },
  ])('reserves recovery paths before changing any published output: %j', (paths) => {
    const old = snapshot();
    const configFile = config(paths);
    const configBytes = readFileSync(configFile);
    const result = cli();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('paths must not overlap');
    expect(snapshot()).toEqual(old);
    expect(readFileSync(configFile)).toEqual(configBytes);
    expect(readFileSync(join(dir, 'source/a.png'))).toEqual(picture);
    expect(existsSync(`${configFile}.publish-state.json`)).toBe(false);
    expect(existsSync(`${configFile}.publish-state.json.tmp`)).toBe(false);
  });

  it('preserves an existing recovery temporary file instead of overwriting it', () => {
    const old = snapshot();
    index({ fresh: 'a.png' });
    const tmp = put('publish.json.publish-state.json.tmp', { preserve: true });
    const bytes = readFileSync(tmp);
    const result = cli();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('scratch already exists');
    expect(snapshot()).toEqual(old);
    expect(readFileSync(tmp)).toEqual(bytes);
  });

  it.each(['source directory', 'source file', 'index', 'config', 'target', 'backup', 'marker'])('rejects a %s symlink alias before changing any input or prior output', (kind) => {
    const old = snapshot();
    index({ fresh: 'a.png' });
    let input = join(dir, 'source/a.png');
    if (kind === 'source directory') {
      symlinkSync(join(dir, 'chosen'), join(dir, 'source-alias'), 'dir');
      config({ root: 'source-alias' });
      index({ fresh: 'old.png' });
      input = join(dir, 'source-alias/old.png');
    } else if (kind === 'source file') {
      symlinkSync(join(dir, 'chosen/old.png'), join(dir, 'source/alias.png'), 'file');
      index({ fresh: 'alias.png' });
      input = join(dir, 'source/alias.png');
    } else if (kind === 'index' || kind === 'config') {
      input = join(dir, kind === 'index' ? 'index.json' : 'publish.json');
      const actual = join(dir, 'chosen', kind === 'index' ? 'index.json' : 'config.json');
      renameSync(input, actual);
      symlinkSync(actual, input, 'file');
    } else {
      symlinkSync(kind === 'target' ? join(dir, 'chosen') : dir, join(dir, 'alias'), 'dir');
      config(kind === 'marker' ? { manifest: 'alias/publish.json.publish-state.json' } : { out: kind === 'target' ? 'alias/nested/art' : 'alias/chosen.publish-backup' });
    }
    const bytes = readFileSync(input);
    const result = cli();
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/replace|overlap/);
    expect(snapshot()).toEqual(old);
    expect(readFileSync(input)).toEqual(bytes);
    expect(existsSync(join(dir, 'publish.json.publish-state.json'))).toBe(false);
  });

  it('preserves valid input symlinks and publishes and recovers through a separate aliased output parent', () => {
    const old = snapshot();
    index({ 'fresh:one': 'a.png' });
    config({ root: 'source-alias', out: 'public-alias/art' });
    mkdirSync(join(dir, 'inputs'));
    for (const file of ['publish.json', 'index.json']) {
      renameSync(join(dir, file), join(dir, 'inputs', file));
      symlinkSync(join(dir, 'inputs', file), join(dir, file), 'file');
    }
    symlinkSync(join(dir, 'source'), join(dir, 'source-alias'), 'dir');
    symlinkSync(join(dir, 'public'), join(dir, 'public-alias'), 'dir');
    const paths = ['publish.json', 'index.json', 'source/a.png'].map((file) => join(dir, file));
    const before = paths.map((file) => readFileSync(file));
    const targets = ['chosen', 'public-alias/art', 'public/manifest.json'].map((file) => join(dir, file));
    const script = `
      import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
      import { beginPublication } from ${JSON.stringify(new URL('./publication.ts', import.meta.url).href)};
      let calls = 0;
      const p = beginPublication(${JSON.stringify(targets)}, ${JSON.stringify(join(dir, 'publish.json.publish-state.json'))}, (a, b) => {
        renameSync(a, b); if (++calls === 4) process.exit(73);
      });
      for (const path of p.paths.slice(0, 2)) { mkdirSync(path); writeFileSync(path + '/unfinished.png', 'unfinished'); }
      writeFileSync(p.paths[2], '{}');
      p.commit();
    `;
    expect(spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).status).toBe(73);
    const recovered = cli('--recover');
    expect(recovered.status, recovered.stderr).toBe(0);
    expect(snapshot()).toEqual(old);
    const result = cli();
    expect(result.status, result.stderr).toBe(0);
    expect(paths.map((file) => readFileSync(file))).toEqual(before);
    expect(check([...checkArgs(), '--need-ids', put('ids.json', ['fresh:one'])], io)).toBe(0);
  });

  it.each([1, 2, 3, 4, 5, 6])('recovers the previous complete release after process interruption at rename %i', (cut) => {
    const old = snapshot();
    const targets = ['chosen', 'public/art', 'public/manifest.json'].map((p) => join(dir, p));
    const marker = join(dir, 'publish.json.publish-state.json');
    const script = `
      import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
      import { beginPublication } from ${JSON.stringify(new URL('./publication.ts', import.meta.url).href)};
      let calls = 0;
      const p = beginPublication(${JSON.stringify(targets)}, ${JSON.stringify(marker)}, (a, b) => {
        renameSync(a, b);
        if (++calls === ${String(cut)}) process.exit(73);
      });
      for (const dir of p.paths.slice(0, 2)) { mkdirSync(dir); writeFileSync(dir + '/fresh.png', 'fresh'); }
      writeFileSync(p.paths[2], '{}');
      p.commit();
    `;
    expect(spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).status).toBe(73);
    expect(cli().status).toBe(2);
    expect(cli('--recover').status).toBe(0);
    expect(snapshot()).toEqual(old);
    expect(existsSync(marker)).toBe(false);
    expect(check(checkArgs(), io)).toBe(0);
  });

  it.each([1, 2, 3, 4, 5, 6])('rolls back a caught failure at rename %i', (cut) => {
    const old = snapshot();
    const targets = ['chosen', 'public/art', 'public/manifest.json'].map((p) => join(dir, p));
    let calls = 0;
    const p = beginPublication(targets, join(dir, 'publish.json.publish-state.json'), (a, b) => {
      if (++calls === cut) throw new Error('blocked rename');
      renameSync(a, b);
    });
    for (const path of p.paths.slice(0, 2)) { mkdirSync(path); writeFileSync(join(path, 'fresh.png'), 'fresh'); }
    writeFileSync(p.paths[2]!, '{}');
    expect(() => p.commit()).toThrow('blocked rename');
    p.abort();
    expect(snapshot()).toEqual(old);
  });

  it.each([0, 32])('recovers when the initial marker write stops after %i bytes', (cut) => {
    const old = snapshot();
    const marker = join(dir, 'publish.json.publish-state.json');
    const script = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { run } from ${JSON.stringify(new URL('./art-publish.ts', import.meta.url).href)};
      const marker = ${JSON.stringify(marker)};
      const write = fs.writeFileSync;
      fs.writeFileSync = (file, bytes, options) => {
        if (file !== marker || options?.flag !== 'wx') return write(file, bytes, options);
        const fd = fs.openSync(file, 'wx');
        if (${String(cut)}) fs.writeSync(fd, bytes.slice(0, ${String(cut)}));
        fs.closeSync(fd);
        process.exit(73);
      };
      syncBuiltinESMExports();
      process.exitCode = await run(['--config', ${JSON.stringify(join(dir, 'publish.json'))}]);
    `;
    expect(spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).status).toBe(73);
    expect(readFileSync(marker).length).toBe(cut);
    expect(cli().status).toBe(2);
    const scratch = put('chosen.publish-next/preserve.txt', Buffer.from('preserve'));
    expect(cli('--recover').status).toBe(2);
    expect(existsSync(scratch)).toBe(true);
    rmSync(scratch);
    rmdirSync(dirname(scratch));
    const recovered = cli('--recover');
    expect(recovered.status, recovered.stderr).toBe(0);
    expect(snapshot()).toEqual(old);
    expect(existsSync(marker)).toBe(false);
    expect(cli().status).toBe(0);
  });

  it('retains recoverable backups if rollback itself fails', () => {
    const old = snapshot();
    const targets = ['chosen', 'public/art', 'public/manifest.json'].map((p) => join(dir, p));
    const marker = join(dir, 'publish.json.publish-state.json');
    let calls = 0;
    const p = beginPublication(targets, marker, (a, b) => {
      if (++calls >= 4) throw new Error('filesystem unavailable');
      renameSync(a, b);
    });
    for (const path of p.paths.slice(0, 2)) { mkdirSync(path); writeFileSync(join(path, 'fresh.png'), 'fresh'); }
    writeFileSync(p.paths[2]!, '{}');
    expect(() => p.commit()).toThrow('filesystem unavailable');
    expect(() => p.abort()).toThrow('filesystem unavailable');
    expect(existsSync(marker)).toBe(true);
    expect(cli('--recover').status).toBe(0);
    expect(snapshot()).toEqual(old);
  });

  it('discards only incomplete preparation and refuses a second writer', () => {
    const old = snapshot();
    const p = beginPublication(['chosen', 'public/art', 'public/manifest.json'].map((f) => join(dir, f)), join(dir, 'publish.json.publish-state.json'));
    mkdirSync(p.paths[0]!);
    writeFileSync(join(p.paths[0]!, 'unfinished.png'), 'incomplete');
    expect(cli().status).toBe(2);
    expect(cli('--recover').status).toBe(0);
    expect(snapshot()).toEqual(old);
  });

  it('finishes interrupted committed cleanup without reverting the new release', () => {
    const targets = ['chosen', 'public/art', 'public/manifest.json'].map((p) => join(dir, p));
    const marker = join(dir, 'publish.json.publish-state.json');
    const script = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { beginPublication } from ${JSON.stringify(new URL('./publication.ts', import.meta.url).href)};
      const p = beginPublication(${JSON.stringify(targets)}, ${JSON.stringify(marker)});
      for (const dir of p.paths.slice(0, 2)) { fs.mkdirSync(dir); fs.writeFileSync(dir + '/fresh.png', 'fresh'); }
      fs.writeFileSync(p.paths[2], '{}');
      const rm = fs.rmSync;
      fs.rmSync = (...args) => { if (String(args[0]).endsWith('.publish-backup')) process.exit(74); rm(...args); };
      syncBuiltinESMExports();
      p.commit();
    `;
    expect(spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).status).toBe(74);
    expect(cli('--recover').status).toBe(0);
    expect(readFileSync(join(dir, 'public/art/fresh.png'), 'utf8')).toBe('fresh');
    expect(readFileSync(join(dir, 'public/manifest.json'), 'utf8')).toBe('{}');
    for (const path of targets) expect(existsSync(`${path}.publish-backup`)).toBe(false);
    expect(existsSync(marker)).toBe(false);
  });

  it.each(['write', 'rename'])('rolls back when the final recovery-marker %s fails', (operation) => {
    const old = snapshot();
    index({ fresh: 'a.png' });
    const script = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { run } from ${JSON.stringify(new URL('./art-publish.ts', import.meta.url).href)};
      const method = ${JSON.stringify(operation === 'write' ? 'writeFileSync' : 'renameSync')};
      const original = fs[method];
      let markers = 0;
      fs[method] = (...args) => {
        if (String(args[0]).endsWith('.publish-state.json.tmp') && ++markers === 2) throw new Error('marker update failed');
        return original(...args);
      };
      syncBuiltinESMExports();
      process.exitCode = await run(['--config', ${JSON.stringify(join(dir, 'publish.json'))}]);
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('marker update failed');
    expect(snapshot()).toEqual(old);
  });
});
