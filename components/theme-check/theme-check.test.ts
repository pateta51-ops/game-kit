import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { themeCheck, themeFindings, type ThemeConfig } from './theme-check';

const cfg: ThemeConfig = {
  tokenFile: 'tokens.css',
  dirs: ['ui'],
  fontFamilies: ['Arvo'],
  logoComponent: 'Logo',
  menuFiles: ['ui/Menu.tsx'],
};
const noMenu = { ...cfg, menuFiles: [] };
const kinds = (path: string, text: string) =>
  themeFindings([{ path, text }], noMenu).map((f) => f.split(' ')[0]);
const css = (text: string) => kinds('ui/a.css', text);

describe('theme-check review fixes', () => {
  it('needs the whole value to be a var token', () => {
    expect(css('a{border-radius:4px var(--r);box-shadow:0 0 9px var(--c);font:12px var(--f)}')).toEqual(['RADIUS', 'SHADOW', 'FONT']);
  });
  it('covers corner radii and drop-shadow', () => {
    expect(css('a{border-top-left-radius:3px;filter:drop-shadow(0 0 2px var(--c))}')).toEqual(['RADIUS', 'SHADOW']);
    expect(css('a{border-top-left-radius:var(--r);filter:drop-shadow(var(--s)) blur(1px)}')).toEqual([]);
    expect(kinds('ui/a.tsx', `<p style={{ borderBottomRightRadius: '2px' }} />`)).toEqual(['RADIUS']);
  });
  it('ignores ids, urls and comments when looking for colours', () => {
    expect(kinds('ui/a.tsx', '<a href="#add">x</a> // #fff\n/* #abc */')).toEqual([]);
    expect(css('a{fill:url(#a);mask:url(#b)}')).toEqual([]);
    expect(kinds('ui/a.tsx', '<a href="http://x"/>\n<b style={{ color: "#fff" }} />')).toEqual(['COLOR']);
  });
});

describe('theme-check', () => {
  it('flags colour literals, not tokens or comments', () => {
    expect(css('a{color:#fff;background:rgb(1,2,3)}')).toEqual(['COLOR', 'COLOR']);
    expect(css('/* #fff */ a{color:var(--c)}')).toEqual([]);
  });
  it('exempts the token file', () => {
    expect(kinds('tokens.css', ':root{--c:#fff;--r:4px}')).toEqual([]);
  });
  it('flags fonts outside tokens and the set, and system fonts', () => {
    expect(css('a{font-family:var(--f)}b{font-family:Arvo}')).toEqual([]);
    expect(css('a{font-family:Comic}')).toEqual(['FONT']);
    expect(css('a{font-family:Arvo, serif}')).toEqual(['SYSTEM_FONT']);
    expect(css('a{font:12px Arvo}')).toEqual(['FONT']);
  });
  it('flags radius and shadow literals', () => {
    expect(css('a{border-radius:4px;box-shadow:0 0 2px black}')).toEqual(['RADIUS', 'SHADOW']);
    expect(css('a{border-radius:var(--r);border-radius:0;box-shadow:none;text-shadow:var(--s)}')).toEqual([]);
  });
  it('reads tsx style props and monospace elements', () => {
    expect(kinds('ui/a.tsx', `<pre style={{ fontFamily: 'Courier', borderRadius: '3px' }} />`)).toEqual([
      'FONT',
      'RADIUS',
      'SYSTEM_FONT',
    ]);
  });
  it('requires the logo in menu files', () => {
    const f = (text: string) => themeFindings([{ path: 'ui/Menu.tsx', text }], cfg);
    expect(f('<Logo />')).toEqual([]);
    expect(f('<div/>')).toEqual(['LOGO ui/Menu.tsx: does not render <Logo>']);
    expect(themeFindings([], cfg)).toEqual(['LOGO ui/Menu.tsx: not found']);
  });
  it('walks a folder, skipping excluded files', () => {
    const root = mkdtempSync(join(tmpdir(), 'tc-'));
    mkdirSync(join(root, 'ui'));
    writeFileSync(join(root, 'ui', 'Menu.tsx'), '<Logo />');
    writeFileSync(join(root, 'ui', 'a.css'), 'a{border-radius:9px}');
    writeFileSync(join(root, 'ui', 'a.test.tsx'), '#fff');
    expect(themeCheck(root, { ...cfg, exclude: ['\\.test\\.tsx$'] })).toEqual(['RADIUS ui/a.css: 9px']);
  });
});
