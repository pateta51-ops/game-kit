import { describe, expect, it } from 'vitest';
import { assetPaths, cssUrl, groupDigits, joinBase, listText, plural, pluralWord, signed } from './index.ts';

describe('assets and format', () => {
  it('builds base-aware paths', () => {
    const a = assetPaths('/g/', { face: 'art', icon: 'icons', board: 'boards' }, { iconFiles: { gold: 'g.svg' } });
    expect(a.face('A1')).toBe('/g/art/A1.webp');
    expect(a.board('m')).toBe('/g/boards/m.webp');
    expect(a.icon('gold')).toBe('/g/icons/g.svg');
    expect(a.icon('x')).toBeNull();
    expect(assetPaths('/g', {}).icon('y')).toBe('/g/icon/y.svg');
    expect(a.pub('x.png')).toBe('/g/x.png');
    expect(joinBase('./', 'a')).toBe('./a');
  });
  it('makes css urls absolute', () => expect(cssUrl('a/b.png', 'http://h/x/')).toBe('url(http://h/x/a/b.png)'));
  it('formats', () => {
    expect([plural(1, 'boss'), plural(2, 'boss', 'bosses'), pluralWord(0, 'card')]).toEqual(['1 boss', '2 bosses', 'cards']);
    expect([signed(2), signed(-1), signed(0)]).toEqual(['+2', '-1', '0']);
    expect([listText([]), listText(['a']), listText(['a', 'b']), listText(['a', 'b', 'c'])]).toEqual(['', 'a', 'a and b', 'a, b and c']);
    expect(groupDigits(1234567)).toBe('1,234,567');
  });
});
