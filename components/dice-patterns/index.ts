export type Op = '<' | '<=' | '=' | '>=' | '>';
export type Pattern =
  | { kind: 'same' | 'different' | 'run' | 'even' | 'odd'; n: number }
  | { kind: 'count'; op?: Op; n: number }
  | { kind: 'atLeast' | 'face'; face: number; n: number }
  | { kind: 'sum'; op: Op; value: number }
  | { kind: 'max' | 'spread'; op?: Op; value: number }
  | { kind: 'twoPair' }
  | { kind: 'all' | 'any'; of: readonly Pattern[] };
export type Test = (values: readonly number[]) => boolean;

const OPS: readonly Op[] = ['<', '<=', '=', '>=', '>'];
const cmp = (a: number, op: Op, b: number): boolean =>
  op === '<' ? a < b : op === '<=' ? a <= b : op === '=' ? a === b : op === '>=' ? a >= b : a > b;
const whole = (x: unknown): boolean => typeof x === 'number' && Number.isInteger(x) && x >= 1;

export function checkPattern(data: unknown, at = 'pattern'): string[] {
  if (typeof data !== 'object' || data === null) return [`${at}: not an object`];
  const d = data as Record<string, unknown>;
  const p: string[] = [];
  const num = (k: string) => { if (!whole(d[k])) p.push(`${at}.${k}: a whole number of 1 or more`); };
  const val = () => { if (typeof d.value !== 'number' || !Number.isFinite(d.value)) p.push(`${at}.value: a number`); };
  const op = (opt: boolean) => { if (!(opt && d.op === undefined) && !OPS.includes(d.op as Op)) p.push(`${at}.op: one of ${OPS.join(', ')}`); };
  switch (d.kind) {
    case 'same': case 'different': case 'run': case 'even': case 'odd': num('n'); break;
    case 'count': op(true); num('n'); break;
    case 'atLeast': case 'face': num('face'); num('n'); break;
    case 'sum': op(false); val(); break;
    case 'max': case 'spread': op(true); val(); break;
    case 'twoPair': break;
    case 'all': case 'any':
      if (!Array.isArray(d.of) || d.of.length === 0) p.push(`${at}.of: a list of 1 or more patterns`);
      else d.of.forEach((x, i) => p.push(...checkPattern(x, `${at}.of[${i}]`)));
      break;
    default: p.push(`${at}: unknown kind ${JSON.stringify(d.kind)}`);
  }
  return p;
}

function met(p: Pattern, v: readonly number[]): boolean {
  const counts = new Map<number, number>();
  for (const x of v) counts.set(x, (counts.get(x) ?? 0) + 1);
  const count = (f: (x: number) => boolean): number => v.filter(f).length;
  switch (p.kind) {
    case 'same': return Math.max(0, ...counts.values()) >= p.n;
    case 'different': return counts.size >= p.n;
    case 'run': {
      const u = [...counts.keys()].sort((a, b) => a - b);
      let run = 0;
      for (let i = 0; i < u.length; i += 1) { run = i > 0 && u[i] === (u[i - 1] as number) + 1 ? run + 1 : 1; if (run >= p.n) return true; }
      return false;
    }
    case 'even': return count((x) => x % 2 === 0) >= p.n;
    case 'odd': return count((x) => Math.abs(x % 2) === 1) >= p.n;
    case 'count': return v.length >= 1 && cmp(v.length, p.op ?? '>=', p.n);
    case 'atLeast': return count((x) => x >= p.face) >= p.n;
    case 'face': return count((x) => x === p.face) >= p.n;
    case 'sum': return v.length >= 1 && cmp(v.reduce((a, b) => a + b, 0), p.op, p.value);
    case 'max': return v.length >= 1 && cmp(Math.max(...v), p.op ?? '=', p.value);
    case 'spread': return v.length >= 2 && cmp(Math.max(...v) - Math.min(...v), p.op ?? '=', p.value);
    case 'twoPair': return [...counts.values()].filter((x) => x >= 2).length >= 2;
    case 'all': return p.of.every((q) => met(q, v));
    case 'any': return p.of.some((q) => met(q, v));
  }
}

export function compile(p: Pattern): Test {
  const bad = checkPattern(p);
  if (bad.length) throw new Error(bad.join('; '));
  return (v) => met(p, v);
}

/** A dice-tray `Meaning`: dice with value 0 or less (0 is not rolled) are left out; `compile` and `smallest` judge every value they are given. */
export function meaning<T = string>(id: string, p: Pattern, label: T): { id: string; label: T; test(dice: readonly { value: number }[]): boolean } {
  const test = compile(p);
  return { id, label, test: (dice) => test(dice.map((d) => d.value).filter((x) => x > 0)) };
}

const search = (ok: (s: readonly number[]) => boolean, n: number): number[] | null => {
  for (let size = 1; size <= n; size += 1) {
    const walk = (from: number, acc: number[]): number[] | null => {
      if (acc.length === size) return ok(acc) ? acc : null;
      for (let i = from; i < n; i += 1) { const r = walk(i + 1, [...acc, i]); if (r) return r; }
      return null;
    };
    const r = walk(0, []);
    if (r) return r;
  }
  return null;
};

const metParts = (p: Pattern, v: readonly number[]): Pattern =>
  p.kind === 'any' ? { kind: 'any', of: p.of.filter((q) => met(q, v)).map((q) => metParts(q, v)) }
    : p.kind === 'all' ? { kind: 'all', of: p.of.map((q) => metParts(q, v)) } : p;

/** Indexes of the smallest non-empty set of dice that meets `p` judged on that set alone (ties: lowest indexes), or null. `whole`: null unless every die together meets `p` too, and an `any` then reads only the parts the whole roll meets. */
export function smallest(p: Pattern, values: readonly number[], opts: { whole?: boolean } = {}): number[] | null {
  const test = compile(p);
  if (opts.whole && !test(values)) return null;
  const q = opts.whole ? metParts(p, values) : p;
  return search((s) => met(q, s.map((i) => values[i] as number)), values.length);
}

export type Lack =
  | { kind: 'same' | 'different' | 'even' | 'odd' | 'twoPair' | 'atLeast' | 'face'; have: number; need: number; face?: number }
  | { kind: 'run'; have: number; need: number; gaps: number[] }
  | { kind: 'count' | 'sum' | 'max' | 'spread'; op: Op; value: number; have: number; by: number; dir: 'up' | 'down'; dice: number }
  | { kind: 'any'; of: Lack[][] };

const away = (have: number, op: Op, value: number): { by: number; dir: 'up' | 'down' } => {
  const up = op === '>=' ? value - have : op === '>' ? value + 1 - have : op === '=' ? value - have : -1;
  const down = op === '<=' ? have - value : op === '<' ? have - value + 1 : op === '=' ? have - value : -1;
  return up > 0 ? { by: up, dir: 'up' } : down > 0 ? { by: down, dir: 'down' } : { by: 0, dir: 'up' };
};

function lacks(p: Pattern, v: readonly number[]): Lack[] {
  if (met(p, v)) return [];
  const counts = new Map<number, number>();
  for (const x of v) counts.set(x, (counts.get(x) ?? 0) + 1);
  const cnt = (f: (x: number) => boolean): number => v.filter(f).length;
  const plain = (kind: 'same' | 'different' | 'even' | 'odd' | 'atLeast' | 'face', n: number, have: number, face?: number): Lack[] => [{ kind, have, need: n - have, ...(face === undefined ? {} : { face }) }];
  const cmpL = (kind: 'count' | 'sum' | 'max' | 'spread', op: Op, value: number, have: number, dice: number): Lack[] => [{ kind, op, value, have, ...away(have, op, value), dice }];
  switch (p.kind) {
    case 'same': {
      let best: number | undefined;
      for (const [x, c] of counts) if (best === undefined || c > (counts.get(best) as number) || (c === counts.get(best) && x < best)) best = x;
      return plain('same', p.n, best === undefined ? 0 : counts.get(best) as number, best);
    }
    case 'different': return plain('different', p.n, counts.size);
    case 'even': return plain('even', p.n, cnt((x) => x % 2 === 0));
    case 'odd': return plain('odd', p.n, cnt((x) => Math.abs(x % 2) === 1));
    case 'atLeast': return plain('atLeast', p.n, cnt((x) => x >= p.face), p.face);
    case 'face': return plain('face', p.n, cnt((x) => x === p.face), p.face);
    case 'run': {
      const u = [...counts.keys()].sort((a, b) => a - b);
      if (!u.length) return [{ kind: 'run', have: 0, need: p.n, gaps: [] }];
      let have = 0, run = 0, bestAt = -1, gaps: number[] = [];
      u.forEach((x, i) => { run = i > 0 && x === (u[i - 1] as number) + 1 ? run + 1 : 1; have = Math.max(have, run); });
      for (let s = u[0] as number; s <= (u[u.length - 1] as number); s += 1) {
        const g: number[] = [];
        for (let x = s; x < s + p.n; x += 1) if (!counts.has(x)) g.push(x);
        if (bestAt < 0 || g.length < gaps.length) { bestAt = s; gaps = g; }
      }
      return [{ kind: 'run', have, need: gaps.length, gaps }];
    }
    case 'twoPair': {
      const pairs = [...counts.values()].filter((c) => c >= 2).length, singles = [...counts.values()].filter((c) => c === 1).length;
      const m = 2 - pairs, s = Math.min(m, singles);
      return [{ kind: 'twoPair', have: pairs, need: s + 2 * (m - s) }];
    }
    case 'count': return cmpL('count', p.op ?? '>=', p.n, v.length, v.length < 1 ? 1 : 0);
    case 'sum': return cmpL('sum', p.op, p.value, v.reduce((a, b) => a + b, 0), v.length < 1 ? 1 : 0);
    case 'max': return cmpL('max', p.op ?? '=', p.value, v.length ? Math.max(...v) : 0, v.length < 1 ? 1 : 0);
    case 'spread': return cmpL('spread', p.op ?? '=', p.value, v.length ? Math.max(...v) - Math.min(...v) : 0, Math.max(0, 2 - v.length));
    case 'all': return p.of.flatMap((q) => lacks(q, v));
    case 'any': return [{ kind: 'any', of: p.of.map((q) => lacks(q, v)) }];
  }
}

/** What `values` lack to meet `p`, as data (empty when nothing is missing). Judged on the whole roll; without `whole`, empty too when some set of the dice meets `p` (`smallest` is not null). */
export function missing(p: Pattern, values: readonly number[], opts: { whole?: boolean } = {}): Lack[] {
  compile(p);
  return !opts.whole && smallest(p, values) !== null ? [] : lacks(p, values);
}
