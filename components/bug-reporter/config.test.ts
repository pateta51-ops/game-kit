import { describe, expect, it, vi } from 'vitest';
import { collectReport } from './collect.ts';
import { bugConfig, configureBugReporter } from './config.ts';
import { parseReport } from './report.ts';
import './test-utils.ts';

describe('configuration', () => {
  it('using the reporter before configureBugReporter throws a clear error', async () => {
    vi.resetModules();
    const fresh = await import('./config.ts');
    expect(() => fresh.bugConfig()).toThrow('configureBugReporter was not called.');
  });

  it('accepts exactly the format this game produces and rejects any other', () => {
    const r = collectReport('x', null);
    expect(r.format).toBe('test-bug-report');
    expect(parseReport(JSON.stringify(r)).ok).toBe(true);
    expect(parseReport(JSON.stringify({ ...r, format: 'other-bug-report' })).ok).toBe(false);
    expect(parseReport(JSON.stringify({ ...r, format: 'bug-report' })).ok).toBe(false);
  });

  it('a snapshot() that throws, or returns what cannot be cloned, does not break the report', () => {
    const c = bugConfig();
    try {
      configureBugReporter({
        ...c,
        snapshot: () => {
          throw new Error('boom');
        },
      });
      const r = collectReport('x', null);
      expect(r.replay).toBeNull();
      expect(parseReport(JSON.stringify(r)).ok).toBe(true);
      configureBugReporter({
        ...c,
        snapshot: () => ({ ...c.snapshot(), replay: { saveVersion: 1, f: () => 1 } as never }),
      });
      const r2 = collectReport('y', null);
      expect(r2.replay).toBeNull();
      expect(parseReport(JSON.stringify(r2)).ok).toBe(true);
    } finally {
      configureBugReporter(c);
    }
  });

  it('takes the version of a saves-part save (`version` only) as the report saveVersion (K736)', () => {
    const c = bugConfig();
    const snap = (replay: unknown) => () => ({ ...c.snapshot(), replay: replay as never });
    try {
      configureBugReporter({ ...c, snapshot: snap({ version: 3, state: {} }) });
      const r = collectReport('v', null);
      expect(r.replay?.saveVersion).toBe(3);
      expect(parseReport(JSON.stringify(r)).ok).toBe(true);
      configureBugReporter({ ...c, snapshot: snap({ saveVersion: 2, version: 3 }) });
      expect(collectReport('s', null).replay?.saveVersion).toBe(2);
      configureBugReporter({ ...c, snapshot: snap({ state: {} }) });
      const r3 = collectReport('n', null);
      expect(parseReport(JSON.stringify(r3)).ok).toBe(false);
    } finally {
      configureBugReporter(c);
    }
  });
});
