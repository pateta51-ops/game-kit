// K100: one console line to a debug edit (netrunner's slash commands, MIT; the syntax only, written new).
import type { DebugAction } from '../engine-core/index';

/** Positional argument names per game verb (`summon: ['card']` lets `/summon 9` mean `card=9`). */
export type DebugParams = Readonly<Record<string, readonly string[]>>;

const value = (t: string): unknown => {
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return t;
  }
};
const num = (t: string | undefined): number | undefined => (t === undefined || t === '' || Number.isNaN(Number(t)) ? undefined : Number(t));

/**
 * `/set counter 5 [min] [max]` (path with dots), `/force 3 1 [name=add]`, `/close`, `/<verb> key=value ...` (positional
 * tokens named by `params`). The slash is optional. Returns the action or the words why not.
 */
export function parseDebug(line: string, verbs: readonly string[], params: DebugParams = {}): DebugAction | { error: string } {
  const toks = [...line.trim().replace(/^\//, '').matchAll(/(\S*?)"([^"]*)"|(\S+)/g)].map((m) => m[3] ?? `${m[1] ?? ''}${m[2] ?? ''}`);
  const [verb, ...rest] = toks;
  if (verb === undefined) return { error: 'Type a command.' };
  if (!verbs.includes(verb)) return { error: `Unknown command "${verb}". Commands: ${verbs.join(', ')}.` };
  const named: Record<string, unknown> = {};
  const pos: string[] = [];
  for (const t of rest) {
    const at = t.indexOf('=');
    if (at > 0) named[t.slice(0, at)] = value(t.slice(at + 1));
    else pos.push(t);
  }
  if (verb === 'set') {
    const [path, v, min, max] = pos;
    const n = num(v);
    if (path === undefined || n === undefined) return { error: 'Use: set path.to.number value [min] [max]' };
    const args: Record<string, unknown> = { path: path.split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k)), value: n };
    if (num(min) !== undefined) args['min'] = num(min);
    if (num(max) !== undefined) args['max'] = num(max);
    return { kind: 'debug', verb, args };
  }
  if (verb === 'force') {
    const values = pos.map(num);
    if (values.length === 0 || values.some((v) => v === undefined)) return { error: 'Use: force n [n ...] [name=roll]' };
    return { kind: 'debug', verb, args: { ...named, values } };
  }
  if (verb === 'close') return { kind: 'debug', verb };
  const names = params[verb] ?? [];
  if (pos.length > names.length) return { error: `${verb} takes ${names.length === 0 ? 'only key=value' : names.join(', ')}.` };
  pos.forEach((t, i) => (named[names[i] as string] = value(t)));
  return { kind: 'debug', verb, args: named };
}
