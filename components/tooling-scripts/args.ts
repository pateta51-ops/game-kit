import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}
export const stdio: Io = { out: (l) => console.log(l), err: (l) => console.error(l) };

/** `--flag value` pairs (repeatable) and bare `bools`; `--config <json>` supplies the same names, flags win. Null on an unknown flag or a missing value. */
export function flags(args: readonly string[], known: readonly string[], bools: readonly string[] = []): Record<string, string[]> | null {
  const given: Record<string, string[]> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    const name = arg.replace(/^--/, '');
    if (!arg.startsWith('--')) return null;
    if (bools.includes(name)) {
      given[name] = ['true'];
      continue;
    }
    i += 1;
    const value = args[i];
    if (value === undefined || (name !== 'config' && !known.includes(name))) return null;
    (given[name] ??= []).push(value);
  }
  const file = given['config']?.[0];
  if (file === undefined) return given;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(resolve(file), 'utf8')) as Record<string, unknown>)) {
    if (!known.includes(k) && !bools.includes(k)) return null;
    if (v !== false) out[k] = (Array.isArray(v) ? (v as unknown[]) : [v]).map((x) => String(x));
  }
  return { ...out, ...given };
}

export const isMain = (url: string): boolean => process.argv[1] !== undefined && url === pathToFileURL(resolve(process.argv[1])).href;
