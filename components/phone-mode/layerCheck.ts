// Static checks of a game's phone CSS, as pure functions over the text (the game's test reads the files).
export interface CssSource {
  file: string;
  css: string;
}
export interface CssBlock {
  file: string;
  selector: string;
  body: string;
}

const q = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/"/g, "'");

/**
 * The style rules of each source, comments removed, selectors with single quotes and single spaces. A rule inside an
 * at-rule keeps its own selector; a nested rule gets its parent's (`&` or a descendant) and the parent keeps its own
 * declarations.
 */
export function cssBlocks(sources: readonly CssSource[]): CssBlock[] {
  const out: CssBlock[] = [];
  for (const { file, css } of sources) {
    const stack: { selector: string; at: boolean; body: string }[] = [];
    let buf = '';
    for (const c of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
      const top = stack[stack.length - 1];
      if (c === '{') {
        const sel = q(buf);
        const outer = top?.selector ?? '';
        const at = sel.startsWith('@');
        stack.push({
          at,
          body: '',
          selector: at ? outer : outer === '' ? sel : sel.includes('&') ? sel.replaceAll('&', outer) : `${outer} ${sel}`,
        });
        buf = '';
      } else if (c === '}') {
        const done = stack.pop();
        if (done !== undefined && done.selector !== '') {
          done.body += buf;
          if (!done.at || done.body.trim() !== '') out.push({ file, selector: done.selector, body: done.body });
        }
        buf = '';
      } else if (c === ';') {
        if (top !== undefined) top.body += `${buf};`;
        buf = '';
      } else buf += c;
    }
  }
  return out;
}

export interface LayerCheckOptions {
  /** Only rules whose selector contains this are checked (either kind of quotes); '' checks every rule. Default `data-layout='phone'`. */
  scope?: string;
  /** The variable that holds the full height. Default `--pm-h`. */
  heightVar?: string;
  /** Selectors (or their endings) that are `position: fixed` by a rule outside the scope. */
  fixedBase?: readonly string[];
  /** Selectors left out of both checks. */
  allow?: readonly string[];
}

export interface LayerCheckResult {
  /** `file: selector` of fixed layers anchored to the bottom that are not `top: 0` with `height: var(heightVar)`. */
  unsized: string[];
  /** `file: selector` of rules that use dvh, svh, lvh or vh without defining `heightVar`. */
  directUnits: string[];
  /** How many rules have `height: var(heightVar)`. */
  guarded: number;
  /** Everything wrong, one line each, including "nothing guarded" (a scope that matches no rule): assert it is empty. */
  faults: string[];
}

function decl(body: string, prop: string): string | undefined {
  const all = [...body.matchAll(new RegExp(`(?:^|[\\s;])${prop}:\\s*([^;]+)`, 'g'))];
  return all[all.length - 1]?.[1]?.replace(/!\s*important/i, '').trim();
}
const zero = (v: string | undefined) => v !== undefined && /^0(px)?$/.test(v);

/**
 * Every fixed layer anchored to the bottom must be `top: 0` (or an `inset` with top 0) with `height: var(heightVar)`,
 * never sized by `bottom`: an iPhone Home Screen app otherwise stops the layer short of the screen.
 */
export function phoneLayerCheck(sources: readonly CssSource[], opts: LayerCheckOptions = {}): LayerCheckResult {
  const scope = q(opts.scope ?? "data-layout='phone'");
  const v = (opts.heightVar ?? '--pm-h').replace(/[^\w-]/g, '');
  const allow = (opts.allow ?? []).map(q);
  const fixedBase = (opts.fixedBase ?? []).map(q);
  const height = new RegExp(`(^|[\\s;])height:\\s*var\\(\\s*${v}\\s*\\)`);
  const defines = new RegExp(`(^|[\\s;])${v}:`);
  const blocks = cssBlocks(sources).filter((b) => b.selector.includes(scope) && !allow.includes(b.selector));
  const name = (b: CssBlock) => `${b.file}: ${b.selector}`;
  const unsized = blocks
    .filter((b) => {
      const inset = decl(b.body, 'inset')?.match(/(?:[^\s(]+|\([^)]*\))+/g) ?? [];
      const bottom = decl(b.body, 'bottom') ?? inset[inset.length > 2 ? 2 : 0];
      const fixed = /position:\s*fixed/.test(b.body) || fixedBase.some((c) => b.selector.endsWith(c));
      const sized = zero(decl(b.body, 'top') ?? inset[0]) && height.test(b.body);
      return fixed && bottom !== undefined && bottom !== 'auto' && !sized;
    })
    .map(name);
  const directUnits = blocks.filter((b) => /\d(dvh|svh|lvh|vh)\b/.test(b.body) && !defines.test(b.body)).map(name);
  const guarded = blocks.filter((b) => height.test(b.body)).length;
  return {
    unsized,
    directUnits,
    guarded,
    faults: [
      ...unsized.map((n) => `${n}: a fixed layer anchored to the bottom needs top: 0 and height: var(${v})`),
      ...directUnits.map((n) => `${n}: a viewport unit outside ${v}`),
      ...(guarded === 0 ? [`no rule with height: var(${v}) in scope ${scope}: nothing was guarded`] : []),
    ],
  };
}

function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(text.slice(from));
  return parts;
}

/** A length in px: `12px`, `0`, `max(a, b)`, `min(a, b)`, `calc(a + b - c)` over px values. Throws on anything else. */
export function evalLength(expr: string): number {
  const text = expr.trim();
  const fn = /^(max|min|calc)\((.*)\)$/.exec(text);
  if (fn?.[2] !== undefined) {
    if (fn[1] === 'calc') return evalLength(fn[2]);
    const args = splitTop(fn[2]).map(evalLength);
    return fn[1] === 'max' ? Math.max(...args) : Math.min(...args);
  }
  const sum = /^(-?[\d.]+)(?:px)?((?:\s+[+-]\s+[\d.]+(?:px)?)*)$/.exec(text);
  if (sum?.[1] === undefined) throw new Error(`cannot read ${expr}`);
  let total = parseFloat(sum[1]);
  for (const m of (sum[2] ?? '').matchAll(/([+-])\s+([\d.]+)/g))
    total += (m[1] === '-' ? -1 : 1) * parseFloat(m[2] ?? '0');
  return total;
}

/**
 * The last `padding-bottom` of the `nth` rule with exactly `selector`, in px, with `inset` px for the bottom safe area
 * (`env(safe-area-inset-bottom)` and `insetVar`, default `--sab`). A bar must not add the whole inset under its buttons
 * where a webview reports the home indicator's 34 px.
 */
export function bottomPadding(css: string, selector: string, inset: number, nth = 0, insetVar = '--sab'): number {
  const block = cssBlocks([{ file: '', css }]).filter((b) => b.selector === q(selector))[nth];
  if (block === undefined) throw new Error(`no ${selector} rule number ${String(nth + 1)}`);
  const declared = [...block.body.matchAll(/(?:^|[\s;])padding-bottom:\s*([^;]+)/g)].map((m) => m[1] ?? '');
  const value = declared[declared.length - 1];
  if (value === undefined) throw new Error(`${selector} has no padding-bottom`);
  const px = `${String(inset)}px`;
  return evalLength(
    value
      .replace(/env\(\s*safe-area-inset-bottom\s*(?:,[^)]*)?\)/g, px)
      .replace(new RegExp(`var\\(\\s*${insetVar.replace(/[^\w-]/g, '')}\\s*(?:,[^)]*)?\\)`, 'g'), px),
  );
}
