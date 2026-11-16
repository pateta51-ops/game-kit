import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetFindings, themeCheck, themeFindings, type ThemeConfig } from './theme-check';

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

describe('theme-check files mode and assets', () => {
  const tree = () => {
    const root = mkdtempSync(join(tmpdir(), 'tc-'));
    mkdirSync(join(root, 'ui', 'deep'), { recursive: true });
    mkdirSync(join(root, 'other'));
    writeFileSync(join(root, 'ui', 'Menu.tsx'), '<div/>');
    writeFileSync(join(root, 'ui', 'a.css'), 'a{border-radius:9px}');
    writeFileSync(join(root, 'ui', 'deep', 'b.css'), 'a{color:#fff}');
    writeFileSync(join(root, 'ui', 'deep', 'c.test.tsx'), '#abc');
    writeFileSync(join(root, 'ui', 'notes.md'), '#fff');
    writeFileSync(join(root, 'other', 'x.css'), 'a{box-shadow:1px 1px}');
    writeFileSync(join(root, 'tokens.css'), 'a{color:#000}');
    return root;
  };
  const ex = { ...cfg, exclude: ['\\.test\\.tsx$'] };
  it('checks only the files, folders and globs given', () => {
    const root = tree();
    expect(themeCheck(root, ex, ['ui/a.css'])).toEqual(['RADIUS ui/a.css: 9px']);
    expect(themeCheck(root, ex, ['ui\\a.css', join(root, 'ui', 'a.css')])).toEqual(['RADIUS ui/a.css: 9px']);
    expect(themeCheck(root, ex, ['other/x.css', 'tokens.css', 'ui/notes.md', 'ui/deep/c.test.tsx'])).toEqual([
      'SHADOW other/x.css: box-shadow 1px 1px',
    ]);
    expect(themeCheck(root, ex, ['ui/*.css'])).toEqual(['RADIUS ui/a.css: 9px']);
    expect(themeCheck(root, ex, ['ui/**/*.css']).sort()).toEqual(['COLOR ui/deep/b.css: #fff', 'RADIUS ui/a.css: 9px']);
    expect(themeCheck(root, ex, ['ui/deep'])).toEqual(['COLOR ui/deep/b.css: #fff']);
    expect(themeCheck(root, ex, ['u?/de*/*'])).toEqual(['COLOR ui/deep/b.css: #fff']);
    expect(themeCheck(root, ex, ['**/*.tsx'])).toEqual(['LOGO ui/Menu.tsx: does not render <Logo>']);
  });
  it('reports a named file that is not there; an empty list or glob finds nothing', () => {
    const root = tree();
    expect(themeCheck(root, ex, ['ui/gone.css'])).toEqual(['FILE ui/gone.css: not found']);
    expect(themeCheck(root, ex, ['nowhere/*.css'])).toEqual(['FILE nowhere/*.css: no file matches']);
    expect(themeCheck(root, ex, ['ui/*.scss', 'ui/a.css'])).toEqual(['FILE ui/*.scss: no file matches', 'RADIUS ui/a.css: 9px']);
    mkdirSync(join(root, 'empty'));
    expect(themeCheck(root, ex, ['empty'])).toEqual(['FILE empty: no file matches']);
    expect(themeCheck(root, ex, [])).toEqual([]);
  });
  it('refuses a path outside the root and leaves node_modules and dot folders alone', () => {
    const root = tree();
    const far = join(root, 'other', 'x.css');
    expect(themeCheck(join(root, 'ui'), ex, [far])).toEqual([`FILE ${far.replace(/\\/g, '/')}: outside the root`]);
    expect(
      themeCheck(root, ex, [join(tmpdir(), 'elsewhere.css'), `${root}-twin/a.css`]).map((f) => f.slice(-16)),
    ).toEqual(['outside the root', 'outside the root']);
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(root, '.cache'));
    writeFileSync(join(root, 'node_modules', 'pkg', 'n.css'), 'a{color:#111}');
    writeFileSync(join(root, '.cache', 'd.css'), 'a{color:#222}');
    writeFileSync(join(root, 'top.css'), 'a{color:#333}');
    expect(themeCheck(root, ex, ['*.css'])).toEqual(['COLOR top.css: #333']);
    expect(themeCheck(root, ex, ['**/*.css']).filter((f) => /#111|#222/.test(f))).toEqual([]);
    expect(themeCheck(root, ex, ['.'])).toContain('COLOR top.css: #333');
  });
  it('checks that the fonts, licences, svgs and files of the look are in place', () => {
    const root = tree();
    const assets = {
      fontDir: 'fonts',
      fonts: [
        { family: 'Arvo', file: 'arvo.woff2' },
        { family: 'Bree', file: 'bree.woff2' },
      ],
      licenceFile: 'fonts/LICENSES.md',
      svgs: ['logo.svg', 'flat.svg', 'gone.svg'],
      files: ['tokens.css', 'sky.webp'],
    };
    expect(assetFindings(root, assets)).toEqual([
      'FONT_MISSING fonts/arvo.woff2 (Arvo)',
      'FONT_MISSING fonts/bree.woff2 (Bree)',
      'FONT_LICENCE fonts/LICENSES.md is missing',
      'SVG logo.svg is missing or has no paths',
      'SVG flat.svg is missing or has no paths',
      'SVG gone.svg is missing or has no paths',
      'FILE sky.webp: not found',
    ]);
    mkdirSync(join(root, 'fonts'));
    for (const f of ['arvo.woff2', 'stray.ttf', 'readme.txt']) writeFileSync(join(root, 'fonts', f), '');
    writeFileSync(join(root, 'fonts', 'LICENSES.md'), '## Arvo\nOFL');
    writeFileSync(join(root, 'logo.svg'), '<svg><path fill="x" d="M0 0"/></svg>');
    writeFileSync(join(root, 'flat.svg'), '<svg><rect/></svg>');
    expect(assetFindings(root, assets)).toEqual([
      'FONT_MISSING fonts/bree.woff2 (Bree)',
      'FONT_UNREFERENCED fonts/stray.ttf',
      'FONT_LICENCE fonts/LICENSES.md does not name Bree',
      'SVG flat.svg is missing or has no paths',
      'SVG gone.svg is missing or has no paths',
      'FILE sky.webp: not found',
    ]);
    expect(assetFindings(root, {})).toEqual([]);
    const withAssets = { ...noMenu, assets: { files: ['sky.webp'] } };
    expect(themeCheck(root, withAssets)).toContain('FILE sky.webp: not found');
    expect(themeCheck(root, withAssets, ['ui/a.css'])).toEqual(['RADIUS ui/a.css: 9px']);
  });
});
