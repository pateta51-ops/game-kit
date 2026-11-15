// Static theme check, configured by a JSON file (see theme-check.config.example.json). Over the files under `dirs`
// with an extension of `exts` (paths matching an `exclude` regex are skipped), outside `tokenFile`:
//   COLOR     a hex, rgb(), hsl() or hwb() colour literal
//   FONT      a font-family or font value that is not a var(...) token or one of `fontFamilies`
//   SYSTEM_FONT  a generic or system family in a font stack, or a code/pre/kbd/samp element (tsx)
//   RADIUS    a border-radius value that is neither 0, a var(...) nor inherit
//   SHADOW    a box-shadow or text-shadow value that is neither none nor a var(...)
//   LOGO      a `menuFiles` file that does not render <logoComponent>
// Exit codes: 0 clean, 1 findings, 2 bad usage.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ThemeConfig {
  tokenFile: string;
  dirs: string[];
  exts?: string[];
  exclude?: string[];
  fontFamilies?: string[];
  logoComponent?: string;
  menuFiles?: string[];
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

export function themeFindings(files: readonly SourceFile[], cfg: ThemeConfig): string[] {
  const out: string[] = [];
  const fams = cfg.fontFamilies ?? [];
  const fontOk = (v: string) =>
    v
      .split(',')
      .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
      .every((p) => p.startsWith('var(') || fams.includes(p));
  for (const f of files) {
    if (f.path === cfg.tokenFile) continue;
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
        else if (prop === 'font-family' ? !fontOk(v) : !WHOLE_VAR.test(v)) out.push(`FONT ${f.path}: ${prop} ${v}`);
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
  return out;
}

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
      )
    : [];

export function themeCheck(root: string, cfg: ThemeConfig): string[] {
  const exts = cfg.exts ?? ['.css', '.tsx'];
  const ex = (cfg.exclude ?? []).map((r) => new RegExp(r));
  const menu = cfg.menuFiles ?? [];
  const files = [...cfg.dirs.flatMap((d) => walk(join(root, d))), ...menu.map((p) => join(root, p))]
    .map((p) => relative(root, p).replace(/\\/g, '/'))
    .filter((p, i, a) => a.indexOf(p) === i && existsSync(join(root, p)))
    .filter((p) => menu.includes(p) || (exts.some((e) => p.endsWith(e)) && !ex.some((r) => r.test(p))))
    .map((p) => ({ path: p, text: readFileSync(join(root, p), 'utf8') }));
  return themeFindings(files, cfg);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--config');
  const cfgPath = i > 0 ? process.argv[i + 1] : undefined;
  if (!cfgPath || !existsSync(cfgPath)) {
    console.error('usage: theme-check --config <file.json> [--root <dir>]');
    process.exit(2);
  }
  const r = process.argv.indexOf('--root');
  const root = resolve(r > 0 ? (process.argv[r + 1] ?? '.') : '.');
  const findings = themeCheck(root, JSON.parse(readFileSync(cfgPath, 'utf8')) as ThemeConfig);
  for (const f of findings) console.log(f);
  console.log(`theme-check: ${findings.length ? `${String(findings.length)} finding(s)` : 'clean'}`);
  process.exit(findings.length ? 1 : 0);
}
