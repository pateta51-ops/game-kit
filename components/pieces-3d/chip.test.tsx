import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip } from './Pieces3d.tsx';

describe('pieces-3d: Chip tilt', () => {
  it('tilt sets --piece-tilt on the chip; without it nothing is set', () => {
    const a = render(<Chip tilt="20deg" src="a.png" alt="a" />).container.querySelector('.p3-chip') as HTMLElement;
    expect(a.style.getPropertyValue('--piece-tilt')).toBe('20deg');
    const b = render(<Chip src="b.png" alt="b" />).container.querySelector('.p3-chip') as HTMLElement;
    expect(b.getAttribute('style')).toBeNull();
  });
});

describe('pieces-3d: Chip dieCut', () => {
  it('dieCut marks the chip and its css turns the rectangle layers off', () => {
    const a = render(<Chip dieCut src="a.webp" alt="a" />).container.querySelector('.p3-chip') as HTMLElement;
    expect(a.classList.contains('p3-diecut')).toBe(true);
    expect(a.hasAttribute('data-p3-diecut')).toBe(true);
    const b = render(<Chip src="b.png" alt="b" />).container.querySelector('.p3-chip') as HTMLElement;
    expect(b.classList.contains('p3-diecut')).toBe(false);
    expect(b.hasAttribute('data-p3-diecut')).toBe(false);
    const css = readFileSync(join(__dirname, 'pieces3d.css'), 'utf8');
    expect(css).toMatch(/\.p3-chip\.p3-diecut::before,\.p3-chip\.p3-diecut::after\{display:none\}/);
    expect(css).toMatch(/\.p3-chip\.p3-diecut>img\{transform:none;filter:drop-shadow/);
  });
});
