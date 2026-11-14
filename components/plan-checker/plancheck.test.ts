// BUILD_PLAN §10.1: npm run plancheck finds a Python 3 (python3 first on Linux, python and the py launcher on Windows).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { candidates } from './plancheck';

describe('plancheck interpreters (§10.1)', () => {
  it('tries PYTHON first, then the platform order', () => {
    expect(candidates({ PYTHON: '/opt/py/bin/python' }, 'linux')).toEqual([
      ['/opt/py/bin/python'],
      ['python3'],
      ['python'],
    ]);
    expect(candidates({}, 'linux')).toEqual([['python3'], ['python']]);
    expect(candidates({ PYTHON: '' }, 'win32')).toEqual([['python'], ['py', '-3'], ['python3']]);
  });
});

describe('plancheck.py matches the build-plan skill', () => {
  it('has the extraction options workers start from', () => {
    const py = readFileSync(new URL('./plancheck.py', import.meta.url), 'utf-8');
    for (const opt of ['--batch', '--section']) expect(py).toContain(opt);
  });
});
