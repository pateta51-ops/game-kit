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

describe('theme-check K74 options', () => {
  const run = (files: Record<string, string>, extra: Partial<ThemeConfig>) =>
    themeFindings(
      Object.entries(files).map(([path, text]) => ({ path, text })),
      { ...noMenu, ...extra },
    );
  const fontFaces = [{ family: 'Arvo', file: 'arvo.woff2' }];
  it('fontFaces: each family has an @font-face that loads its file, also in the token file', () => {
    expect(run({ 'tokens.css': `@font-face{font-family:'Arvo';src:url('/fonts/arvo.woff2')}` }, { fontFaces })).toEqual([]);
    expect(run({ 'tokens.css': ':root{}' }, { fontFaces })).toEqual(['FONTFACE no @font-face loads Arvo']);
    expect(run({ 'tokens.css': `@font-face{font-family:Arvo;src:url(/fonts/other.woff2)}` }, { fontFaces })).toEqual([
      'FONTFACE tokens.css: Arvo loads /fonts/other.woff2, not arvo.woff2',
      'FONTFACE no @font-face loads Arvo',
    ]);
    expect(
      run({ 'tokens.css': `@font-face{font-family:Arvo;src:url(arvo.woff2)}@font-face{font-family:Comic;src:url(c.woff2)}` }, { fontFaces }),
    ).toEqual(['FONTFACE tokens.css: @font-face for Comic']);
    expect(run({ 'tokens.css': ':root{}' }, {})).toEqual([]);
  });
  it('bodyFont: the body is set in a token or an allowed family', () => {
    expect(run({ 'ui/a.css': 'body{margin:0;font-family:var(--f)}' }, { bodyFont: true })).toEqual([]);
    expect(run({ 'tokens.css': 'html,body{font-family:Arvo}' }, { bodyFont: true })).toEqual([]);
    expect(run({ 'ui/a.css': 'p{font-family:var(--f)}' }, { bodyFont: true })).toEqual(['BODY_FONT the body is not set in a theme family']);
    expect(run({ 'tokens.css': 'body{font-family:Comic}' }, { bodyFont: true })).toEqual(['BODY_FONT the body is not set in a theme family']);
    expect(run({ 'ui/a.css': 'p{font-family:var(--f)}' }, {})).toEqual([]);
  });
  it('looseFont: a font shorthand may end in a token or an allowed family', () => {
    const loose = (text: string) => run({ 'ui/a.css': text }, { looseFont: true }).map((f) => f.split(' ')[0]);
    expect(loose('a{font:12px var(--f)}b{font:italic 1rem/1.2 Arvo}')).toEqual([]);
    expect(loose('a{font:12px Comic}')).toEqual(['FONT']);
    expect(loose('a{font:12px Arvo, serif}')).toEqual(['SYSTEM_FONT']);
    expect(css('a{font:12px var(--f)}')).toEqual(['FONT']);
  });
  it('menuDirs: every tsx directly in the folder renders the menu component', () => {
    const files = {
      'ui/screens/Home.tsx': '<MenuFrame><p/></MenuFrame>',
      'ui/screens/Bad.tsx': '<div/>',
      'ui/screens/deep/Part.tsx': '<div/>',
      'ui/screens/a.css': 'a{}',
      'ui/screens/MenuFrame.tsx': '<Logo />',
    };
    const extra = { menuDirs: ['ui/screens'], menuFiles: ['ui/screens/MenuFrame.tsx'] };
    expect(run(files, { ...extra, menuComponent: 'MenuFrame' })).toEqual(['LOGO ui/screens/Bad.tsx: does not render <MenuFrame>']);
    expect(run(files, extra)).toEqual([
      'LOGO ui/screens/Home.tsx: does not render <Logo>',
      'LOGO ui/screens/Bad.tsx: does not render <Logo>',
    ]);
    expect(run(files, { menuFiles: ['ui/screens/MenuFrame.tsx'] })).toEqual([]);
  });
  it('K182 assets.icons.pathStartsWithM: a path d must start with M or m, off by default', () => {
    const root = mkdtempSync(join(tmpdir(), 'tc-iconm-'));
    writeFileSync(join(root, 'A.svg'), '<svg><path d="M0 0"/></svg>');
    writeFileSync(join(root, 'B.svg'), '<svg><path d="m0 0"/></svg>');
    writeFileSync(join(root, 'C.svg'), '<svg><path d="L0 0"/></svg>');
    expect(assetFindings(root, { icons: { dir: '.', tokens: ['A', 'B', 'C'] } })).toEqual([]);
    expect(assetFindings(root, { icons: { dir: '.', tokens: ['A', 'B', 'C'], pathStartsWithM: true } })).toEqual(['ICON ./C.svg has a path whose d does not start with M']);
  });

  it('assets.icons: each token has an svg and the list file defines no other token', () => {
    const root = mkdtempSync(join(tmpdir(), 'tc-icons-'));
    mkdirSync(join(root, 'icons'));
    writeFileSync(join(root, 'icons', 'COIN.svg'), '<svg><path d="M0 0"/></svg>');
    writeFileSync(join(root, 'icons', 'WOOD.svg'), '<svg></svg>');
    writeFileSync(join(root, 'ICONS.md'), '| Token | Means |\n| [COIN] | a coin |\n| [GOAT] | a goat |\n');
    expect(assetFindings(root, { icons: { dir: 'icons', tokens: ['COIN'] } })).toEqual([]);
    expect(assetFindings(root, { icons: { dir: 'icons', tokens: ['COIN', 'WOOD', 'INGOT'], listFile: 'ICONS.md' } })).toEqual([
      'ICON icons/WOOD.svg is missing or has no paths',
      'ICON icons/INGOT.svg is missing or has no paths',
      'ICON ICONS.md defines [GOAT] but the icon list lacks it',
    ]);
    expect(assetFindings(root, { icons: { dir: 'icons', tokens: ['COIN'], listFile: 'ICONS.md', listPattern: '^\\| \\[(GOAT)\\]' } })).toEqual([
      'ICON ICONS.md defines [GOAT] but the icon list lacks it',
    ]);
    expect(assetFindings(root, { icons: { dir: 'icons', tokens: ['COIN'], listFile: 'none.md' } })).toEqual([]);
  });
  it('themeCheck reads the token file for fontFaces and skips them in files mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'tc-faces-'));
    mkdirSync(join(root, 'ui'));
    writeFileSync(join(root, 'tokens.css'), `@font-face{font-family:Arvo;src:url(/fonts/arvo.woff2)}body{font-family:Arvo}`);
    writeFileSync(join(root, 'ui', 'a.css'), 'a{color:var(--c)}');
    const c = { ...noMenu, fontFaces, bodyFont: true };
    expect(themeCheck(root, c)).toEqual([]);
    writeFileSync(join(root, 'tokens.css'), ':root{}');
    expect(themeCheck(root, c)).toEqual(['FONTFACE no @font-face loads Arvo', 'BODY_FONT the body is not set in a theme family']);
    expect(themeCheck(root, c, ['ui/a.css'])).toEqual([]);
  });
});

describe('theme-check K74 review fixes', () => {
  const run = (files: Record<string, string>, extra: Partial<ThemeConfig>) =>
    themeFindings(
      Object.entries(files).map(([path, text]) => ({ path, text })),
      { ...noMenu, ...extra },
    );
  const fontVars = ['--f'];
  it('fontVars: only the listed variables are font tokens for the body and font-family', () => {
    expect(run({ 'tokens.css': 'body{font-family:var(--size)}' }, { bodyFont: true, fontVars })).toEqual(['BODY_FONT the body is not set in a theme family']);
    expect(run({ 'tokens.css': 'body{font-family:var(--f)}' }, { bodyFont: true, fontVars })).toEqual([]);
    expect(run({ 'tokens.css': 'body{font-family:var(--size)}' }, { bodyFont: true })).toEqual([]);
    expect(run({ 'ui/a.css': 'a{font-family:var(--size)}b{font-family:var(--f)}' }, { fontVars })).toEqual(['FONT ui/a.css: font-family var(--size)']);
  });
  it('looseFont: the value ends in an accepted token or an exact allowed family', () => {
    const kind = (text: string, extra: Partial<ThemeConfig>) => run({ 'ui/a.css': text }, { looseFont: true, ...extra }).map((f) => f.split(' ')[0]);
    expect(kind('a{font:12px MyArvo}', {})).toEqual(['FONT']);
    expect(kind('a{font:12px MyArvo}', { fontVars })).toEqual(['FONT']);
    expect(kind('a{font:var(--size)}', { fontVars })).toEqual(['FONT']);
    expect(kind('a{font:12px var(--size)}', { fontVars })).toEqual(['FONT']);
    expect(kind(`a{font:12px var(--f)}b{font:var(--f)}c{font:12px 'Arvo'}`, { fontVars })).toEqual([]);
    expect(kind('a{font:var(--size)}', {})).toEqual([]);
  });
  it('fontSrcPrefix: the src ends in the prefix and the file', () => {
    const fontFaces = [{ family: 'Arvo', file: 'arvo.woff2' }];
    const bare = { 'tokens.css': '@font-face{font-family:Arvo;src:url(arvo.woff2)}' };
    expect(run(bare, { fontFaces })).toEqual([]);
    expect(run(bare, { fontFaces, fontSrcPrefix: '/fonts/' })).toEqual([
      'FONTFACE tokens.css: Arvo loads arvo.woff2, not /fonts/arvo.woff2',
      'FONTFACE no @font-face loads Arvo',
    ]);
    expect(run({ 'tokens.css': '@font-face{font-family:Arvo;src:url(/fonts/arvo.woff2)}' }, { fontFaces, fontSrcPrefix: '/fonts/' })).toEqual([]);
  });
  it('licenceHeading: the licence file has a heading per family', () => {
    const root = mkdtempSync(join(tmpdir(), 'tc-lic-'));
    const a = { licenceFile: 'L.md', fonts: [{ family: 'Arvo', file: 'a.woff2' }] };
    writeFileSync(join(root, 'L.md'), 'Arvo is under the OFL\n');
    expect(assetFindings(root, a)).toEqual([]);
    expect(assetFindings(root, { ...a, licenceHeading: true })).toEqual(['FONT_LICENCE L.md does not name Arvo']);
    writeFileSync(join(root, 'L.md'), '# Fonts\r\n## Arvo\r\nOFL\r\n');
    expect(assetFindings(root, { ...a, licenceHeading: true })).toEqual([]);
  });
  it('menuDirs: a trailing slash is the same folder, a folder outside dirs or missing is a finding', () => {
    const files = { 'ui/screens/Bad.tsx': '<div/>' };
    expect(run(files, { menuDirs: ['ui/screens/'] })).toEqual(['LOGO ui/screens/Bad.tsx: does not render <Logo>']);
    const root = mkdtempSync(join(tmpdir(), 'tc-menu-'));
    mkdirSync(join(root, 'ui', 'screens'), { recursive: true });
    mkdirSync(join(root, 'menus'));
    writeFileSync(join(root, 'ui', 'screens', 'Bad.tsx'), '<div/>');
    expect(themeCheck(root, { ...noMenu, menuDirs: ['./ui/screens/', 'menus', 'nope'] })).toEqual([
      'LOGO menus: menu folder outside dirs',
      'LOGO nope: menu folder not found',
      'LOGO ui/screens/Bad.tsx: does not render <Logo>',
    ]);
  });
  it('the token file path is normalised', () => {
    expect(run({ 'tokens.css': ':root{--c:#fff}' }, { tokenFile: './tokens.css' })).toEqual([]);
    const root = mkdtempSync(join(tmpdir(), 'tc-tok-'));
    mkdirSync(join(root, 'ui'));
    writeFileSync(join(root, 'tokens.css'), ':root{--c:#fff}');
    expect(themeCheck(root, { ...noMenu, tokenFile: './tokens.css' })).toEqual([]);
  });
});

describe('theme-check K135 rule switches and token file', () => {
  const src = [{ path: 'ui/a.css', text: 'a{color:#fff;border-radius:4px;box-shadow:0 0 2px black;font-family:Comic}' }];
  it('defaults: every rule on, the token file exempt', () => {
    expect(themeFindings(src, noMenu).map((f) => f.split(' ')[0])).toEqual(['COLOR', 'RADIUS', 'SHADOW', 'FONT']);
    expect(themeFindings(src, { ...noMenu, rules: {} })).toEqual(themeFindings(src, noMenu));
    expect(themeFindings(src, { ...noMenu, rules: { COLOR: true } })).toEqual(themeFindings(src, noMenu));
    expect(themeFindings([{ path: 'tokens.css', text: 'a{font-family:Comic;color:#fff}' }], { ...noMenu, checkTokenFile: false })).toEqual([]);
  });
  it('rules: a switch per rule, COLOR, RADIUS and SHADOW included', () => {
    expect(themeFindings(src, { ...noMenu, rules: { COLOR: false, RADIUS: false, SHADOW: false } })).toEqual(['FONT ui/a.css: font-family Comic']);
    for (const r of ['COLOR', 'RADIUS', 'SHADOW', 'FONT'])
      expect(themeFindings(src, { ...noMenu, rules: { [r]: false } }).map((f) => f.split(' ')[0])).toEqual(['COLOR', 'RADIUS', 'SHADOW', 'FONT'].filter((x) => x !== r));
    const menu = [{ path: 'ui/Menu.tsx', text: '<pre style={{ fontFamily: "Arvo, serif" }} />' }];
    const c = { ...cfg, fontFaces: [{ family: 'Arvo', file: 'a.woff2' }], bodyFont: true };
    expect(themeFindings(menu, c).map((f) => f.split(' ')[0]).sort()).toEqual(['BODY_FONT', 'FONTFACE', 'LOGO', 'SYSTEM_FONT', 'SYSTEM_FONT']);
    expect(themeFindings(menu, { ...c, rules: { SYSTEM_FONT: false, LOGO: false, FONTFACE: false, BODY_FONT: false } })).toEqual([]);
  });
  it('rules: asset and file findings too', () => {
    const root = mkdtempSync(join(tmpdir(), 'tc-rules-'));
    mkdirSync(join(root, 'ui'));
    writeFileSync(join(root, 'tokens.css'), ':root{--c:#fff}');
    const c = { ...noMenu, assets: { files: ['sky.webp'], svgs: ['logo.svg'] } };
    expect(themeCheck(root, c)).toEqual(['SVG logo.svg is missing or has no paths', 'FILE sky.webp: not found']);
    expect(themeCheck(root, { ...c, rules: { SVG: false } })).toEqual(['FILE sky.webp: not found']);
    expect(themeCheck(root, { ...c, rules: { SVG: false, FILE: false } })).toEqual([]);
  });
  it('bodyFontToken: the body font must be a token, not a family name', () => {
    const b = (text: string, o: Partial<ThemeConfig>) => themeFindings([{ path: 'ui/a.css', text }], { ...noMenu, bodyFont: true, ...o });
    const miss = ['BODY_FONT the body is not set in a theme family'];
    expect(b('body{font-family:Arvo}', {})).toEqual([]);
    expect(b('body{font-family:Arvo}', { bodyFontToken: false })).toEqual([]);
    expect(b('body{font-family:Arvo}', { bodyFontToken: true })).toEqual(miss);
    expect(b('body{font-family:var(--f-ui), Arvo}', { bodyFontToken: true })).toEqual(miss);
    expect(b('body{font-family:var(--f-ui)}', { bodyFontToken: true })).toEqual([]);
    expect(b('body{font-family:var(--f-ui)}', { bodyFontToken: true, fontVars: ['--f-ui'] })).toEqual([]);
    expect(b('body{font-family:var(--f-ui)}', { bodyFontToken: true, fontVars: ['--f-head'] })).toEqual(['FONT ui/a.css: font-family var(--f-ui)', ...miss]);
    expect(b('body{font-family:Arvo}', { bodyFontToken: true, bodyFont: false })).toEqual([]);
  });
  it('checkTokenFile: the token file is checked like any other file', () => {
    const tok = [{ path: 'tokens.css', text: ':root{--c:#fff;--f:Arvo}a{font-family:Comic;border-radius:4px}' }];
    expect(themeFindings(tok, { ...noMenu, tokenFile: './tokens.css', checkTokenFile: true })).toEqual(['COLOR tokens.css: #fff', 'FONT tokens.css: font-family Comic', 'RADIUS tokens.css: 4px']);
    expect(themeFindings(tok, { ...noMenu, checkTokenFile: true, rules: { COLOR: false, RADIUS: false, SHADOW: false } })).toEqual(['FONT tokens.css: font-family Comic']);
    const root = mkdtempSync(join(tmpdir(), 'tc-tokchk-'));
    mkdirSync(join(root, 'ui'));
    writeFileSync(join(root, 'tokens.css'), 'a{font-family:Comic}');
    expect(themeCheck(root, noMenu)).toEqual([]);
    expect(themeCheck(root, { ...noMenu, checkTokenFile: true })).toEqual(['FONT tokens.css: font-family Comic']);
    expect(themeCheck(root, { ...noMenu, checkTokenFile: true }, ['tokens.css'])).toEqual(['FONT tokens.css: font-family Comic']);
  });
});
