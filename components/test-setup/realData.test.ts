import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ensureRealData, loadRealData, realDataSetup } from './realData.ts';

describe('real-data setup', () => {
  it('builds once, then reuses the cache; rebuilds when the pack changes', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ts-'));
    const dir = join(tmp, 'pack');
    mkdirSync(dir);
    writeFileSync(join(dir, 'a.json'), '{}');
    const build = vi.fn(() => ({ cards: 3 }));
    const spec = { name: 'p', dir, build, tmp };
    expect((await ensureRealData(spec)).status).toBe('built');
    expect((await ensureRealData(spec)).status).toBe('cached');
    expect(build).toHaveBeenCalledTimes(1);
    expect(loadRealData<{ cards: number }>('p', dir, tmp)).toEqual({ cards: 3 });
    const later = new Date(Date.now() + 5000);
    utimesSync(join(dir, 'a.json'), later, later);
    expect((await ensureRealData(spec)).status).toBe('built');
  });
  it('rebuilds when an input or the version changes; two dirs with one name do not collide', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ts-'));
    const mk = (n: string) => {
      const d = join(tmp, n);
      mkdirSync(d);
      writeFileSync(join(d, 'a.json'), n);
      return d;
    };
    const [d1, d2] = [mk('one'), mk('two')] as [string, string];
    const spec = (dir: string, version?: string) => ({ name: 'p', dir, build: () => dir, tmp, ...(version ? { version } : {}) });
    expect((await ensureRealData(spec(d1))).status).toBe('built');
    expect((await ensureRealData(spec(d2))).status).toBe('built');
    expect(loadRealData('p', d1, tmp)).toBe(d1);
    expect(loadRealData('p', d2, tmp)).toBe(d2);
    expect((await ensureRealData(spec(d1))).status).toBe('cached');
    expect((await ensureRealData(spec(d1, 'v2'))).status).toBe('built');
    writeFileSync(join(d1, 'a.json'), 'changed content');
    expect((await ensureRealData(spec(d1, 'v2'))).status).toBe('built');
  });
  it('skips with a clear message when the pack is missing, and fails under CI when required', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ts-'));
    const spec = { name: 'none', dir: join(tmp, 'absent'), build: () => 1, tmp };
    const r = await ensureRealData(spec);
    expect(r.status).toBe('skipped');
    expect(r.message).toMatch(/absent.*skip/);
    expect(loadRealData('none', spec.dir, tmp)).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await realDataSetup(spec)();
    expect(warn).toHaveBeenCalledOnce();
    vi.stubEnv('CI', 'true');
    await expect(ensureRealData({ ...spec, requireInCI: true })).rejects.toThrow(/CI/);
    vi.unstubAllEnvs();
    warn.mockRestore();
  });
});
