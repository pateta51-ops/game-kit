import { spawnSync } from 'node:child_process';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { coverageReport, runCli, walkConstructs } from './index.ts';
import fake from './fake-pack.ts';
import { CoverageReportView } from './ui.ts';

describe('coverage-report', () => {
  it('walks ops and triggers', () => {
    expect(walkConstructs({ on: 'x', then: [{ op: 'gain', n: { op: 'calc' } }] })).toEqual(['on:x', 'op:gain', 'op:calc']);
  });
  it('fake game: one covered, one uncovered, one unused, one empty card', () => {
    const r = coverageReport(fake);
    expect(r.used.map((u) => [u.construct, u.handled])).toEqual([['op:gain', true], ['op:warp', false]]);
    expect(r.unhandled).toEqual([{ construct: 'op:warp', cards: ['b'] }]);
    expect(r.unused).toEqual(['op:draw']);
    expect(r.empty).toEqual(['c']);
  });
  it('exit code: 1 only with --strict and an unhandled construct', () => {
    const out: string[] = [];
    expect(runCli(fake, [], (s) => out.push(s))).toBe(0);
    expect(runCli(fake, ['--strict'], (s) => out.push(s))).toBe(1);
    expect(runCli({ ...fake, handlers: ['op:gain', 'op:warp'] }, ['--strict'], () => undefined)).toBe(0);
    expect(out[0]).toContain('op:warp | 1 | b | MISSING');
  });
  it('cli.ts runs a module and exits non-zero', () => {
    const p = spawnSync('node', ['components/coverage-report/cli.ts', 'components/coverage-report/fake-pack.ts', '--strict'], { encoding: 'utf8' });
    expect(p.status).toBe(1);
    expect(p.stdout).toContain('MISSING');
  });
  it('page renders a row per construct', () => {
    const { container } = render(<CoverageReportView report={coverageReport(fake)} />);
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
    expect(container.querySelector('[data-construct="op:warp"]')?.getAttribute('data-handled')).toBe('false');
    expect(container.querySelector('[data-unused]')?.textContent).toContain('op:draw');
  });
});
