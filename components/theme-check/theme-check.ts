// Static theme check, configured by a JSON file (see theme-check.config.example.json). Over the files under `dirs`
// with an extension of `exts` (paths matching an `exclude` regex are skipped), outside `tokenFile`:
//   COLOR     a hex, rgb(), hsl() or hwb() colour literal
//   FONT      a font-family or font value that is not a var(...) token or one of `fontFamilies`
//   SYSTEM_FONT  a generic or system family in a font stack, or a code/pre/kbd/samp element (tsx)
//   RADIUS    a border-radius value that is neither 0, a var(...) nor inherit
//   SHADOW    a box-shadow or text-shadow value that is neither none nor a var(...)
//   LOGO      a `menuFiles` file that does not render <logoComponent>, or a .tsx directly in a `menuDirs` folder
//             that does not render <menuComponent> (default logoComponent)
//   FONTFACE  (`fontFaces`) an @font-face for another family or file, or a family no @font-face loads
//   BODY_FONT (`bodyFont`) no body rule sets font-family to a token or an allowed family
//   `looseFont`: a font shorthand may end in a var(...) token or an allowed family
// `rules`: `{ "COLOR": false }` drops every finding of that rule (any rule name above or below; default all on).
// `bodyFontToken` (with `bodyFont`): the body font must be a var(...) token, not a family name.
// `checkTokenFile`: the token file is checked like any other file (default: exempt).
// Files mode: paths, folders or globs (relative to the root) after the flags check only those files; no asset check.
// `assets` (the look's files are in place): FONT_MISSING, FONT_UNREFERENCED, FONT_LICENCE, SVG, FILE.
// Exit codes: 0 clean, 1 findings, 2 bad usage.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ThemeConfig {
  tokenFile: string;
  dirs: string[];
  exts?: string[];
  exclude?: string[];
  fontFamilies?: string[];
  logoComponent?: string;
  menuFiles?: string[];
  menuDirs?: string[];
  menuComponent?: string;
  fontFaces?: { family: string; file: string }[];
  bodyFont?: boolean;
  bodyFontToken?: boolean;
  looseFont?: boolean;
  fontVars?: string[];
  fontSrcPrefix?: string;
  assets?: ThemeAssets;
  rules?: Record<string, boolean>;
  checkTokenFile?: boolean;
}
export interface ThemeAssets {
  fontDir?: string;
  fonts?: { family: string; file: string }[];
  licenceFile?: string;
  licenceHeading?: boolean;
  svgs?: string[];
  files?: string[];
  icons?: { dir: string; tokens: string[]; listFile?: string; listPattern?: string; pathStartsWithM?: boolean };
}
export interface SourceFile {
  path: string;
  text: string;
}

const GENERIC =
  /(^|[\s,'"])(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|-apple-system|BlinkMacSystemFont|Georgia|Times|Times New Roman|Arial|Helvetica|Segoe UI|Roboto)([\s,'"]|$)/i;
const WHOLE_VAR = /^var\([^()]*\)$/;
const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb)\(/gi;
const DECL =
  /(?:^|[;{\s'"])(font-family|fontFamily|font|border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius|border(?:Top|Bottom|Start|End)?(?:Left|Right|Start|End)?Radius|filter|box-shadow|boxShadow|text-shadow|textShadow)\s*:\s*([^;}\n]+)/g;

const on = (cfg: ThemeConfig) => (f: string) => cfg.rules?.[f.split(' ')[0] as string] !== false;
const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

export function themeFindings(files: readonly SourceFile[], cfg: ThemeConfig): string[] {
  const out: string[] = [];
  const fams = cfg.fontFamilies ?? [];
  const fv = cfg.fontVars;
  const shortOk = (v: string) => {
    const u = v.replace(/['"]/g, '');
    const tail = (x: string) => u === x || u.endsWith(` ${x}`);
    return (
      (fv ? fv.some((n) => u === `var(${n})`) : WHOLE_VAR.test(v)) ||
      (!!cfg.looseFont && (fams.some(tail) || (fv ? fv.some((n) => tail(`var(${n})`)) : /(^|\s)var\([^()]*\)$/.test(u))))
    );
  };
  const fontOk = (v: string) =>
    v
      .split(',')
      .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
      .every((p) => (fv ? fv.some((n) => p === `var(${n})`) : p.startsWith('var(')) || fams.includes(p));
  const ff = cfg.fontFaces ?? [];
  const faces = new Set<string>();
  let body = false;
  for (const f of files) {
    if ((ff.length > 0 || cfg.bodyFont) && f.path.endsWith('.css')) {
      const css = f.text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of ff.length > 0 ? css.matchAll(/@font-face\s*{([^}]*)}/g) : []) {
        const b = m[1] as string;
        const fam = /font-family\s*:\s*['"]?([^;'"]+)/.exec(b)?.[1]?.trim();
        const src = decodeURIComponent(/url\(\s*['"]?([^'")]+)/.exec(b)?.[1] ?? '');
        const fits = ff.filter((x) => x.family === fam);
        const font = fits.find((x) => (cfg.fontSrcPrefix ? src.endsWith(cfg.fontSrcPrefix + x.file) : src === x.file || src.endsWith(`/${x.file}`)));
        if (fits.length === 0) out.push(`FONTFACE ${f.path}: @font-face for ${String(fam)}`);
        else if (!font) out.push(`FONTFACE ${f.path}: ${String(fam)} loads ${src}, not ${fits.map((x) => (cfg.fontSrcPrefix ?? '') + x.file).join(' or ')}`);
        else faces.add(`${font.family}\0${font.file}`);
      }
      const bv = (/(?:^|[},])\s*body\s*(?:,[^{]*)?{[^}]*?font-family\s*:\s*([^;}]+)/m.exec(css)?.[1] ?? '').trim();
      if (bv && !GENERIC.test(bv) && fontOk(bv) && (!cfg.bodyFontToken || (fv ? fv.some((n) => bv === `var(${n})`) : WHOLE_VAR.test(bv)))) body = true;
    }
    if (!cfg.checkTokenFile && f.path === norm(cfg.tokenFile)) continue;
    const text = f.text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(f.path.endsWith('.tsx') ? /(^|[^:])\/\/.*$/gm : /$^/g, '$1')
      .replace(/url\([^)]*\)/g, 'url()')
      .replace(/href\s*=\s*(["'])#[^"']*\1/g, 'href=""');
    for (const m of text.matchAll(COLOR)) out.push(`COLOR ${f.path}: ${m[0]}`);
    const parts = f.path.endsWith('.tsx') ? text.split(/,(?=\s*[a-zA-Z]+\s*:)/) : [text];
    for (const m of parts.flatMap((t) => [...t.matchAll(DECL)])) {
      const prop = (m[1] as string).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      let v = (m[2] as string).trim();
      if (f.path.endsWith('.tsx')) v = /^(['"`])([^'"`]*)\1/.exec(v)?.[2] ?? v.split(',')[0] ?? v;
      v = v.replace(/[,'"`]+$/, '');
      if (prop === 'font-family' || prop === 'font') {
        if (GENERIC.test(v)) out.push(`SYSTEM_FONT ${f.path}: ${prop} ${v}`);
        else if (prop === 'font-family' ? !fontOk(v) : !shortOk(v)) out.push(`FONT ${f.path}: ${prop} ${v}`);
      } else if (prop.endsWith('radius')) {
        if (!/^(0|0px|inherit|initial)$/.test(v) && !WHOLE_VAR.test(v)) out.push(`RADIUS ${f.path}: ${v}`);
      } else if (prop === 'filter') {
        if (/drop-shadow\((?!\s*var\([^()]*\)\s*\))/.test(v)) out.push(`SHADOW ${f.path}: filter ${v}`);
      } else if (v !== 'none' && !WHOLE_VAR.test(v)) out.push(`SHADOW ${f.path}: ${prop} ${v}`);
    }
    if (f.path.endsWith('.tsx') && /<(code|pre|kbd|samp)[\s>]/.test(text))
      out.push(`SYSTEM_FONT ${f.path}: a monospace element`);
  }
  if (cfg.logoComponent) {
    const re = new RegExp(`<${cfg.logoComponent}[\\s/>]`);
    for (const p of cfg.menuFiles ?? []) {
      const f = files.find((x) => x.path === p);
      if (!f) out.push(`LOGO ${p}: not found`);
      else if (!re.test(f.text)) out.push(`LOGO ${p}: does not render <${cfg.logoComponent}>`);
    }
  }
  for (const x of ff)
    if (!faces.has(`${x.family}\0${x.file}`)) out.push(`FONTFACE no @font-face loads ${x.family}${ff.filter((y) => y.family === x.family).length > 1 ? ` (${x.file})` : ''}`);
  if (cfg.bodyFont && !body) out.push('BODY_FONT the body is not set in a theme family');
  const mc = cfg.menuComponent ?? cfg.logoComponent;
  const md = (cfg.menuDirs ?? []).map(norm);
  if (mc && md.length) {
    const re = new RegExp(`<${mc}[\\s/>]`);
    for (const f of files)
      if (
        f.path.endsWith('.tsx') &&
        md.some((d) => f.path.startsWith(`${d}/`) && !f.path.slice(d.length + 1).includes('/')) &&
        !(cfg.menuFiles ?? []).includes(f.path) &&
        !re.test(f.text)
      )
        out.push(`LOGO ${f.path}: does not render <${mc}>`);
  }
  return out.filter(on(cfg));
}

const walk = (dir: string, lean = false): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        lean && d.isDirectory() && (d.name === 'node_modules' || d.name.startsWith('.'))
          ? []
          : d.isDirectory()
            ? walk(join(dir, d.name), lean)
            : [join(dir, d.name)],
      )
    : [];

export function assetFindings(root: string, a: ThemeAssets): string[] {
  const out: string[] = [];
  const fonts = a.fonts ?? [];
  if (a.fontDir !== undefined) {
    const dir = join(root, a.fontDir);
    const have = existsSync(dir) ? readdirSync(dir) : [];
    for (const f of fonts) if (!have.includes(f.file)) out.push(`FONT_MISSING ${a.fontDir}/${f.file} (${f.family})`);
    for (const n of have.filter((x) => /\.(ttf|otf|woff2?)$/i.test(x)))
      if (!fonts.some((f) => f.file === n)) out.push(`FONT_UNREFERENCED ${a.fontDir}/${n}`);
  }
  if (a.licenceFile !== undefined) {
    const lic = join(root, a.licenceFile);
    const text = existsSync(lic) ? readFileSync(lic, 'utf8') : '';
    if (!text) out.push(`FONT_LICENCE ${a.licenceFile} is missing`);
    else for (const f of fonts) if (a.licenceHeading ? !text.split(/\r?\n/).some((l) => l.trim() === `## ${f.family}`) : !text.includes(f.family)) out.push(`FONT_LICENCE ${a.licenceFile} does not name ${f.family}`);
  }
  for (const p of a.svgs ?? []) {
    const t = existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '';
    if (!t.includes('<svg') || !/<path\s[^>]*\bd=|<(circle|rect|ellipse|polygon|polyline|line|use)\b/.test(t)) out.push(`SVG ${p} is missing or has no paths`);
  }
  for (const p of a.files ?? []) if (!existsSync(join(root, p))) out.push(`FILE ${p}: not found`);
  const ic = a.icons;
  if (ic) {
    for (const t of ic.tokens) {
      const p = `${ic.dir}/${t}.svg`;
      const s = existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '';
      if (!s.includes('<svg') || !/<path\s[^>]*\bd=/.test(s)) out.push(`ICON ${p} is missing or has no paths`);
      else if (ic.pathStartsWithM && !/<path\s[^>]*\bd=["']\s*[Mm]/.test(s)) out.push(`ICON ${p} has a path whose d does not start with M`);
    }
    const lf = ic.listFile ?? '';
    const list = lf && existsSync(join(root, lf)) ? readFileSync(join(root, lf), 'utf8') : '';
    for (const m of list.matchAll(new RegExp(ic.listPattern ?? '^\\| \\[([A-Z_0-9]+)\\]', 'gm')))
      if (m[1] && !ic.tokens.includes(m[1])) out.push(`ICON ${lf} defines [${m[1]}] but the icon list lacks it`);
  }
  return out;
}

const globRe = (g: string) =>
  new RegExp(
    `^${g.replace(/\*\*\/?|\*|\?|[.+^${}()|[\]\\]/g, (m) =>
      m.startsWith('**') ? '.*' : m === '*' ? '[^/]*' : m === '?' ? '[^/]' : `\\${m}`,
    )}$`,
  );

export function themeCheck(root: string, cfg: ThemeConfig, only?: readonly string[]): string[] {
  const exts = cfg.exts ?? ['.css', '.tsx'];
  const ex = (cfg.exclude ?? []).map((r) => new RegExp(r));
  const rel = (p: string) => relative(root, p).replace(/\\/g, '/');
  const missing: string[] = [];
  const picked = only?.flatMap((raw) => {
    const g = raw.replace(/\\/g, '/');
    const cut = g.search(/[*?]/);
    const at = resolve(root, cut < 0 ? g : g.slice(0, cut).replace(/[^/]*$/, ''));
    const top = resolve(root);
    if (at !== top && !at.startsWith(top.endsWith(sep) ? top : top + sep)) {
      missing.push(`FILE ${g}: outside the root`);
      return [];
    }
    if (cut < 0 && !existsSync(at)) missing.push(`FILE ${rel(at)}: not found`);
    if (cut < 0 && !statSync(at, { throwIfNoEntry: false })?.isDirectory()) return [rel(at)];
    const re = globRe(cut < 0 ? '**' : g);
    const hit = walk(at, true)
      .map(rel)
      .filter((p) => re.test(p));
    if (!hit.length) missing.push(`FILE ${g}: no file matches`);
    return hit;
  });
  const menu = (cfg.menuFiles ?? []).filter((p) => !picked || picked.includes(p));
  if (!only)
    for (const m of (cfg.menuDirs ?? []).map(norm)) {
      if (!statSync(join(root, m), { throwIfNoEntry: false })?.isDirectory()) missing.push(`LOGO ${m}: menu folder not found`);
      else if (!cfg.dirs.map(norm).some((x) => x === '.' || x === '' || m === x || m.startsWith(`${x}/`)))
        missing.push(`LOGO ${m}: menu folder outside dirs`);
    }
  const files = (picked ?? [...cfg.dirs.flatMap((d) => walk(join(root, d))), ...menu.map((p) => join(root, p)), join(root, cfg.tokenFile)].map(rel))
    .filter((p, i, a) => a.indexOf(p) === i && existsSync(join(root, p)))
    .filter((p) => menu.includes(p) || p === norm(cfg.tokenFile) || (exts.some((e) => p.endsWith(e)) && !ex.some((r) => r.test(p))))
    .map((p) => ({ path: p, text: readFileSync(join(root, p), 'utf8') }));
  return [
    ...missing,
    ...themeFindings(files, { ...cfg, menuFiles: menu, ...(only ? { fontFaces: [], bodyFont: false } : {}) }),
    ...(cfg.assets && !only ? assetFindings(root, cfg.assets) : []),
  ].filter(on(cfg));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--config');
  const cfgPath = i > 0 ? process.argv[i + 1] : undefined;
  if (!cfgPath || !existsSync(cfgPath)) {
    console.error('usage: theme-check --config <file.json> [--root <dir>] [file, folder or glob ...]');
    process.exit(2);
  }
  const r = process.argv.indexOf('--root');
  const root = resolve(r > 0 ? (process.argv[r + 1] ?? '.') : '.');
  const only = process.argv
    .slice(2)
    .filter((a, k, all) => !a.startsWith('--') && !/^--(config|root)$/.test(all[k - 1] ?? ''));
  const findings = themeCheck(root, JSON.parse(readFileSync(cfgPath, 'utf8')) as ThemeConfig, only.length ? only : undefined);
  for (const f of findings) console.log(f);
  console.log(`theme-check: ${findings.length ? `${String(findings.length)} finding(s)` : 'clean'}`);
  process.exit(findings.length ? 1 : 0);
}
