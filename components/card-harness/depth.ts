// K415: test depth. The test calls of a file with their bodies (a full-resolve test asserts; a `<clause id> poor` test calls
// expectNotOffered or expectNotFired), and those two helpers. Ported from two games' depth gates (component.json).
import { IllegalActionError } from '../engine-core/index.ts';
import { cardCasesIn, type CardCaseInfo } from './inventory.ts';

export interface TestCall {
  readonly title: string;
  readonly body: string;
  /** Under `.skip`, `.todo` or `.skipIf`, or inside a skipped `describe`: it covers nothing. */
  readonly skipped: boolean;
  readonly card?: Partial<CardCaseInfo>;
}

const HEAD = /\b(it|test|cardCase|describe)((?:\.\w+)*)\(/g;
const SKIP = /\.(?:skip|todo|skipIf)\b/;

/** The end (exclusive) of the string, template, comment or regex literal starting at `i`, or -1; `prev` is the code character before it. */
function literalEnd(text: string, i: number, prev: string): number {
  const c = text[i];
  if (c === '"' || c === "'") {
    let j = i + 1;
    for (; j < text.length && text[j] !== c && text[j] !== '\n'; j++) if (text[j] === '\\') j++;
    return Math.min(j + 1, text.length);
  }
  if (c === '`') {
    let j = i + 1;
    for (; j < text.length && text[j] !== '`'; j++) {
      if (text[j] === '\\') j++;
      else if (text[j] === '$' && text[j + 1] === '{') j = codeEnd(text, j + 2);
    }
    return Math.min(j + 1, text.length);
  }
  if (c !== '/') return -1;
  if (text[i + 1] === '/') {
    const j = text.indexOf('\n', i);
    return j < 0 ? text.length : j;
  }
  if (text[i + 1] === '*') {
    const j = text.indexOf('*/', i + 2);
    return j < 0 ? text.length : j + 2;
  }
  if (!/^$|[(,=:[!&|?{};\n]/.test(prev)) return -1;
  let j = i + 1;
  for (let cls = false; j < text.length && text[j] !== '\n' && (cls || text[j] !== '/'); j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '[') cls = true;
    else if (text[j] === ']') cls = false;
  }
  return text[j] === '/' ? j + 1 : -1;
}
const prevOf = (text: string, i: number): string => {
  let k = i - 1;
  while (k >= 0 && (text[k] === ' ' || text[k] === '\t')) k--;
  return k < 0 ? '' : (text[k] as string);
};
/** The index of the `}` that closes a template's `${` opened before `i`. */
function codeEnd(text: string, i: number): number {
  let depth = 1;
  for (; i < text.length; i++) {
    const e = literalEnd(text, i, prevOf(text, i));
    if (e >= 0) i = e - 1;
    else if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return i;
}

/** The text with string, template and regex literals and comments blanked (same length; quotes kept). */
export function codeOnly(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const e = literalEnd(text, i, prevOf(out, out.length));
    if (e < 0) {
      out += text[i] as string;
      continue;
    }
    const q = text[i] as string;
    out += q === '/' ? ' '.repeat(e - i) : q + ' '.repeat(Math.max(0, e - i - 2)) + (e - i > 1 ? q : '');
    i = e - 1;
  }
  return out;
}

/** Each `it(` / `test(` call with a literal title and each `cardCase({ ... }, fn)`: title, the text up to its closing parenthesis, skipped or not. */
export function testCalls(text: string): TestCall[] {
  const code = codeOnly(text);
  const calls: (TestCall & { from: number; to: number })[] = [];
  const skips: [number, number][] = [];
  for (const m of code.matchAll(HEAD)) {
    const from = (m.index ?? 0) + m[0].length;
    let i = from;
    for (let depth = 1; i < code.length && depth > 0; i++) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') depth--;
    }
    const kind = m[1] as string;
    const skipped = SKIP.test(m[2] ?? '');
    if (kind === 'describe') {
      if (skipped) skips.push([from, i]);
      continue;
    }
    const body = text.slice(from, i - 1);
    if (kind === 'cardCase') {
      if (!/^\s*\{/.test(body)) continue;
      const card = cardCasesIn(text.slice(m.index ?? 0, i))[0] ?? {};
      calls.push({ title: card.title === undefined ? (card.clause ?? '') : `${card.clause ?? ''} ${card.title}`, body, skipped, card, from, to: i });
      continue;
    }
    const t = /^\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/.exec(body);
    if (t === null) continue;
    calls.push({ title: t[2] ?? '', body, skipped, from, to: i });
  }
  return calls.map(({ from, to, ...c }) => ({ ...c, skipped: c.skipped || skips.some(([a, b]) => from >= a && to <= b) }));
}

/** The body asserts: an `expect…(`, `assert…(` call or `.should`, outside strings and comments. */
export const asserts = (c: TestCall): boolean => /\b(?:expect|assert)\w*\s*[(.]|\.should\b/.test(codeOnly(c.body));
/** The body calls one of the two poor-test helpers itself (outside strings and comments). */
export const callsHelper = (c: TestCall): boolean => /\bexpectNot(?:Offered|Fired)\s*\(/.test(codeOnly(c.body));

interface Opt {
  readonly id: string | number;
  readonly enabled?: boolean;
  readonly disabled?: boolean;
}
type Prompt = { readonly options?: readonly Opt[] } | null;
/** What a `Scenario` gives (a `Delivery` or any object of this shape will do). */
export interface Observed {
  readonly prompt: Prompt;
  readonly s?: unknown;
  readonly events?: readonly unknown[];
  readonly history?: readonly { readonly prompt: unknown }[];
  answer?(...picks: string[]): unknown;
  withRewind?<T>(fn: () => T): T;
}

const ids = (id: string | readonly string[]): readonly string[] => (typeof id === 'string' ? [id] : id);
const on = (o: Opt): boolean => o.enabled !== false && o.disabled !== true;
/** A prompt or event "of" an id: a top-level string field equal to it. */
const names = (x: unknown, want: readonly string[]): boolean =>
  x !== null && typeof x === 'object' && Object.entries(x).some(([k, v]) => k !== 'options' && typeof v === 'string' && want.includes(v));
const offeredIn = (p: unknown, want: readonly string[]): string[] =>
  p === null || typeof p !== 'object' ? [] : ((p as { options?: readonly Opt[] }).options ?? []).filter((o) => on(o) && want.includes(String(o.id))).map((o) => String(o.id));
const sig = (t: Observed): string => `${JSON.stringify(t.s ?? null)}|${String(t.events?.length ?? 0)}`;

/**
 * K415: a player choice that is not offered. No enabled option of `id` and no prompt naming it, now or at any step of the
 * scenario's history (offered, taken and doing nothing fails); taking it (`attempt`, default the scenario's `answer(id)` in a
 * rewind when a prompt is open) is refused (it returns false or throws the engine's refusal, K648: any other throw fails); state and events are as they were.
 */
const causes = (e: unknown): unknown[] => (e instanceof Error && e.cause !== undefined && e.cause !== e ? [e, ...causes(e.cause)] : [e]);
/** K648: the engine's refusal (engine-core's `IllegalActionError`, or the game's own through `refused`), here or in a `cause`. */
export interface NotOfferedOptions {
  readonly refused?: (e: unknown) => boolean;
}
export function expectNotOffered(t: Observed, id: string | readonly string[], attempt?: () => unknown, o: NotOfferedOptions = {}): void {
  const want = ids(id);
  const before = sig(t);
  const steps = [t.prompt, ...(t.history ?? []).map((h) => h.prompt)];
  steps.forEach((p, i) => {
    const at = i === 0 ? 'in the open prompt' : `at step ${String(i)}`;
    const o = offeredIn(p, want);
    if (o.length > 0) throw new Error(`expectNotOffered: ${o.join(', ')} is offered ${at}`);
    if (names(p, want)) throw new Error(`expectNotOffered: a prompt names ${want.join(', ')} ${at}`);
  });
  const tryIt = attempt ?? (t.prompt !== null && t.answer !== undefined && t.withRewind !== undefined ? () => t.withRewind?.(() => t.answer?.(...want)) : undefined);
  if (tryIt !== undefined) {
    let refused: boolean;
    try {
      refused = tryIt() === false;
    } catch (e) {
      if (!causes(e).some(o.refused ?? ((x) => x instanceof IllegalActionError))) throw new Error(`expectNotOffered: taking ${want.join(', ')} crashed instead of being refused: ${String(e)}`, { cause: e });
      refused = true;
    }
    if (!refused) throw new Error(`expectNotOffered: taking ${want.join(', ')} was not refused`);
  }
  if (sig(t) !== before) throw new Error('expectNotOffered: the state or the events changed');
}

/**
 * K415: a forced effect that does not fire. No event naming `id` in the scenario's events (after `act` when given), no prompt
 * open, and with `act` the state unchanged by it (`same` projects the part that must not move; default the whole state).
 */
export function expectNotFired(t: Observed, id: string | readonly string[], act?: () => unknown, same?: (s: never) => unknown): void {
  const want = ids(id);
  const key = (): string => JSON.stringify(same === undefined ? (t.s ?? null) : same(t.s as never));
  const before = key();
  act?.();
  const fired = (t.events ?? []).find((e) => names(e, want));
  if (fired !== undefined) throw new Error(`expectNotFired: ${JSON.stringify(fired)} fired`);
  if (t.prompt !== null) throw new Error(`expectNotFired: a prompt is open: ${JSON.stringify(t.prompt)}`);
  if (act !== undefined && key() !== before) throw new Error('expectNotFired: the state changed');
}
