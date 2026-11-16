export type FieldType = 'boolean' | 'number' | 'string' | 'text' | 'list';
export type Value = string | number | boolean | null | readonly string[] | undefined;
export type Side = 'front' | 'back';
export interface Field<C> { name: string; aliases?: string[]; type: FieldType; get: (card: C, side: Side) => Value }
export class QueryError extends Error {
  line: number;
  col: number;
  constructor(msg: string, line: number, col: number) { super(`${msg} (line ${line}, col ${col})`); this.line = line; this.col = col; }
}
interface Pos { line: number; col: number }
export type Node =
  | { t: 'lit'; v: string | number | boolean | null }
  | { t: 're'; v: RegExp }
  | { t: 'f'; f: string; side: Side; pos: Pos }
  | { t: 'not'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node; pos: Pos };
interface Tok extends Pos { k: 'num' | 'str' | 're' | 'id' | 'op' | 'end'; v: string; flags?: string }

const OPS = ['==', '!=', '<=', '>=', '=', '<', '>', '?', '&', '|', '!', '(', ')', '+', '-', '*', '/'];

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0, line = 1, ls = 0;
  const err = (m: string, at = i): never => { throw new QueryError(m, line, at - ls + 1); };
  const prevValue = () => { const p = out[out.length - 1]; return !!p && (p.k !== 'op' || p.v === ')'); };
  while (i < src.length) {
    const c = src.charAt(i);
    if (c === '\n') { line++; i++; ls = i; continue; }
    if (/\s/.test(c)) { i++; continue; }
    const pos = { line, col: i - ls + 1 };
    if (c === '"') {
      let j = i + 1, s = '';
      while (j < src.length && src.charAt(j) !== '"') { if (src.charAt(j) === '\\') j++; s += src.charAt(j); j++; }
      if (j >= src.length) err('unterminated string');
      out.push({ ...pos, k: 'str', v: s }); i = j + 1; continue;
    }
    if (c === '/' && !prevValue()) {
      let j = i + 1, s = '';
      while (j < src.length && src.charAt(j) !== '/') { if (src.charAt(j) === '\\') { s += src.charAt(j); j++; } s += src.charAt(j); j++; }
      if (j >= src.length) err('unterminated regex');
      j++; let fl = '';
      while (/[gimsuy]/.test(src.charAt(j))) { if (!/[gy]/.test(src.charAt(j))) fl += src.charAt(j); j++; }
      out.push({ ...pos, k: 're', v: s, flags: fl }); i = j; continue;
    }
    const n = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (n) { out.push({ ...pos, k: 'num', v: n[0] }); i += n[0].length; continue; }
    const id = /^[A-Za-z_][\w.]*:?/.exec(src.slice(i));
    if (id) { out.push({ ...pos, k: 'id', v: id[0] }); i += id[0].length; continue; }
    const op = OPS.find(o => src.startsWith(o, i));
    if (!op) err(`unexpected character "${c}"`);
    else { out.push({ ...pos, k: 'op', v: op }); i += op.length; }
  }
  out.push({ line, col: i - ls + 1, k: 'end', v: '' });
  return out;
}

export function parseQuery(src: string): Node {
  const ts = lex(src);
  let p = 0;
  const peek = () => ts[p] as Tok;
  const fail = (m: string, t = peek()): never => { throw new QueryError(m, t.line, t.col); };
  const isOp = (...o: string[]) => peek().k === 'op' && o.includes(peek().v);
  const bin = (sub: () => Node, ops: string[]): Node => {
    let a = sub();
    while (isOp(...ops)) { const t = ts[p++] as Tok; a = { t: 'bin', op: t.v, a, b: sub(), pos: t }; }
    return a;
  };
  const prim = (): Node => {
    const t = peek();
    if (t.k === 'num') { p++; return { t: 'lit', v: Number(t.v) }; }
    if (t.k === 'str') { p++; return { t: 'lit', v: t.v }; }
    if (t.k === 're') {
      p++;
      try { return { t: 're', v: new RegExp(t.v, t.flags) }; } catch { return fail('bad regex', t); }
    }
    if (t.k === 'id') {
      p++;
      if (t.v === 'null') return { t: 'lit', v: null };
      if (t.v === 'true' || t.v === 'false') return { t: 'lit', v: t.v === 'true' };
      if (t.v === 'back:') {
        const f = peek();
        if (f.k !== 'id' || f.v.endsWith(':')) return fail('field expected after back:', f);
        p++; return { t: 'f', f: f.v, side: 'back', pos: f };
      }
      return { t: 'f', f: t.v, side: 'front', pos: t };
    }
    if (isOp('(')) {
      p++; const e = or();
      if (!isOp(')')) fail('")" expected');
      p++; return e;
    }
    return fail(t.k === 'end' ? 'unexpected end of query' : `unexpected "${t.v}"`);
  };
  const un = (): Node => { if (isOp('-')) { const t = ts[p++] as Tok; return { t: 'bin', op: '-', a: { t: 'lit', v: 0 }, b: un(), pos: t }; } return prim(); };
  const mul = () => bin(un, ['*', '/']);
  const sum = () => bin(mul, ['+', '-']);
  const cmp = (): Node => {
    const a = sum();
    if (!isOp('==', '!=', '<=', '>=', '=', '<', '>', '?')) return a;
    const t = ts[p++] as Tok;
    return { t: 'bin', op: t.v, a, b: sum(), pos: t };
  };
  const not = (): Node => { if (isOp('!')) { p++; return { t: 'not', a: not() }; } return cmp(); };
  const and = () => bin(not, ['&']);
  const or = (): Node => bin(and, ['|']);
  const e = or();
  if (peek().k !== 'end') fail(`unexpected "${peek().v}"`);
  return e;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// = is a fuzzy match (case and accents ignored; text contains), == is exact, ? is list contains.
export function compileQuery<C>(src: string, fields: readonly Field<C>[]): (card: C) => boolean {
  const table = new Map<string, Field<C>>();
  for (const f of fields) for (const n of [f.name, ...(f.aliases ?? [])]) table.set(n.toLowerCase(), f);
  const ast = parseQuery(src);
  const check = (n: Node): void => {
    if (n.t === 'f' && !table.has(n.f.toLowerCase())) throw new QueryError(`unknown field "${n.f}"`, n.pos.line, n.pos.col);
    if (n.t === 'not') check(n.a);
    if (n.t === 'bin') { check(n.a); check(n.b); }
  };
  const ty = (n: Node): string => n.t === 'lit' ? (n.v === null ? 'null' : typeof n.v) : n.t === 'f' ? (table.get(n.f.toLowerCase()) as Field<C>).type : n.t === 're' ? 're' : n.t === 'bin' && '+-*/'.includes(n.op) ? 'number' : 'boolean';
  const want = (_n: Node, side: Node, type: string, pos: Pos) => {
    const t = ty(side);
    if (t !== type && t !== 'null' && !(type === 'number' && side.t === 'bin' && '+-*/'.includes(side.op))) throw new QueryError(`${type} expected, got ${t}`, pos.line, pos.col);
  };
  const types = (n: Node): void => {
    if (n.t === 'not') types(n.a);
    if (n.t !== 'bin') return;
    types(n.a); types(n.b);
    if ('+-*/<>'.includes(n.op[0] as string) && n.op !== '->') { want(n, n.a, 'number', n.pos); want(n, n.b, 'number', n.pos); }
    if (n.op === '?') want(n, n.a, 'list', n.pos);
  };
  check(ast);
  types(ast);
  const ev = (n: Node, c: C): Value | RegExp => {
    if (n.t === 'lit' || n.t === 're') return n.v;
    if (n.t === 'f') return (table.get(n.f.toLowerCase()) as Field<C>).get(c, n.side);
    if (n.t === 'not') return !ev(n.a, c);
    if (n.op === '&') return !!ev(n.a, c) && !!ev(n.b, c);
    if (n.op === '|') return !!ev(n.a, c) || !!ev(n.b, c);
    const a = ev(n.a, c), b = ev(n.b, c);
    if (n.op === '?') return Array.isArray(a) ? a.some((x: string) => b instanceof RegExp ? b.test(x) : fold(x) === fold(String(b))) : false;
    if (n.op === '+' || n.op === '-' || n.op === '*' || n.op === '/') {
      if (typeof a !== 'number' || typeof b !== 'number') return null;
      return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : a / b;
    }
    if (n.op === '=' || n.op === '==' || n.op === '!=') {
      const s = Array.isArray(a) ? a.join(' ') : a;
      let r: boolean;
      if (b instanceof RegExp) r = typeof s === 'string' && b.test(s);
      else if (typeof s === 'string' && b !== null) r = n.op === '=' ? fold(s).includes(fold(String(b))) : fold(s) === fold(String(b));
      else r = (s ?? null) === b;
      return n.op === '!=' ? (s ?? null) === null && b !== null ? false : !r : r;
    }
    if (typeof a !== 'number' || typeof b !== 'number') return false;
    return n.op === '<' ? a < b : n.op === '<=' ? a <= b : n.op === '>' ? a > b : a >= b;
  };
  return c => !!ev(ast, c);
}

export const filterCards = <C>(cards: readonly C[], src: string, fields: readonly Field<C>[]): C[] => cards.filter(compileQuery(src, fields));
