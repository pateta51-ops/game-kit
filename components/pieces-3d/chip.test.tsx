import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip } from './Pieces3d';

describe('pieces-3d: Chip tilt', () => {
  it('tilt sets --piece-tilt on the chip; without it nothing is set', () => {
    const a = render(<Chip tilt="20deg" src="a.png" alt="a" />).container.querySelector('.p3-chip') as HTMLElement;
    expect(a.style.getPropertyValue('--piece-tilt')).toBe('20deg');
    const b = render(<Chip src="b.png" alt="b" />).container.querySelector('.p3-chip') as HTMLElement;
    expect(b.getAttribute('style')).toBeNull();
  });
});
