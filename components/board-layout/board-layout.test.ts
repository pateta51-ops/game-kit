import { describe, expect, it } from 'vitest';
import { newLayoutSvg, parseLayout, spaceAt } from './index.ts';

// What Inkscape saves: one attribute per line. The blank file from newLayoutSvg is split the same way.
const blank = newLayoutSvg(400, 300, 'map.jpg', ['A,red,50,50,10,10', 'B,blue,50,50,200,100', 'Q&R']);
const fixture = [
  ...blank.split('\n').slice(0, -1).flatMap((l) => (l.startsWith('<rect') ? l.replace(/ ([\w:-]+=)/g, '\n$1').split('\n') : [l])),
  '<g', 'inkscape:label="Forts"', '>',
  '<circle', 'inkscape:label="C"', 'cx="300"', 'cy="50"', 'r="20"', '/>',
  '</g>',
  '<path', 'd="M 35,35 L 225,125"', '/>',
  '<path', 'd="m 225,125 h 75 v -75"', '/>',
  '</svg>',
].join('\n');

describe('board-layout (K116)', () => {
  const l = parseLayout(fixture);
  it('extracts rects, circles and groups', () => {
    expect(l.nodes['A']).toEqual([10, 10, 50, 50]);
    expect(l.nodes['Q&R']).toEqual([410, 0, 50, 50]);
    expect(l.groups['Forts']?.['C']).toEqual([280, 30, 40, 40]);
  });
  it('matches path ends to the nearest space', () => {
    expect(l.edges[0]).toEqual(['A', 'B', 35, 35, 225, 125]);
    expect(l.adjacency['B']).toContain('A');
    expect(l.adjacency['C']).toEqual(['B']);
  });
  it('finds the space under a point', () => {
    expect(spaceAt(l, 20, 20)).toBe('A');
    expect(spaceAt(l, 399, 299)).toBeUndefined();
  });
  it('names an unlabelled box from the nearest text', () => {
    const u = parseLayout(['<text', 'x="10"', 'y="12"', 'id="t">Home</tspan></text>', '<rect', 'x="0"', 'y="0"', 'width="20"', 'height="20"', '/>'].join('\n'));
    expect(Object.keys(u.nodes)).toEqual(['Home']);
  });
  it('writes a blank layout with the picture', () => {
    expect(blank).toContain('<?xml');
    expect(blank).toContain('xlink:href="map.jpg"');
  });
});
