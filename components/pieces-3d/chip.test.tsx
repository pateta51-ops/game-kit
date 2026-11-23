import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip, Token } from './Pieces3d.tsx';
import { startTokenLayer } from './tokenGl.ts';

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

describe('pieces-3d: Token (K718)', () => {
  it('K718 without WebGL the token is its <Chip dieCut> at mm x pxPerMm, and the layer does not start', () => {
    const t = render(<Token src="t.png" mm={{ w: 25, h: 20, thickness: 2 }} pxPerMm={3} tilt={0.3} turn={Math.PI} />).container.querySelector('[data-p3-token]') as HTMLElement;
    expect([t.style.width, t.style.height, t.getAttribute('data-size'), t.style.getPropertyValue('--chip-thickness')]).toEqual(['75px', '60px', '75,60,6', '6px']);
    expect(t.getAttribute('data-rot')).toBe(`0.3,${String(Math.PI)},0`);
    const chip = t.querySelector('.p3-chip.p3-diecut') as HTMLElement, img = chip.querySelector('img') as HTMLImageElement;
    expect([img.getAttribute('src'), img.style.width, img.style.height]).toEqual(['t.png', '75px', '60px']);
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    expect(startTokenLayer()).toBeNull();
    expect(t.hasAttribute('data-p3-drawn')).toBe(false);
    expect(t.querySelector('canvas')).toBeNull();
    const css = readFileSync(join(__dirname, 'pieces3d.css'), 'utf8');
    expect(css).toMatch(/\[data-p3-token\]\[data-p3-drawn\]>:not\(\.p3-token-gl\)\{visibility:hidden\}/);
  });
});
