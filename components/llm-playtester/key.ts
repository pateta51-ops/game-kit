// Key handling ported from STCC server/opponent/key.ts (a69c8dac): only <GAME>_CLAUDE_API_KEY from a file, never the
// environment; ANTHROPIC_API_KEY alone is refused because it would switch Claude Code to API billing.
import { existsSync, readFileSync } from 'node:fs';

export const keyName = (game: string): string =>
  `${game
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()}_CLAUDE_API_KEY`;

function readVar(file: string, name: string): string {
  let value = '';
  if (!existsSync(file)) return value;
  const re = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*?)\\s*$`);
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = re.exec(line);
    if (match === null) continue;
    const raw = match[1] ?? '';
    if (raw.startsWith('"') || raw.startsWith("'")) {
      const end = raw.indexOf(raw[0]!, 1);
      value = end < 0 ? '' : raw.slice(1, end);
    } else value = raw.replace(/\s+#.*$/, '').trim();
  }
  return value;
}

export function loadKey(
  game: string,
  file: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const name = keyName(game);
  const key = readVar(file, name);
  if (key !== '') return key;
  const why =
    env['ANTHROPIC_API_KEY'] || readVar(file, 'ANTHROPIC_API_KEY') !== ''
      ? ' ANTHROPIC_API_KEY alone is refused: it would switch Claude Code to API billing.'
      : '';
  throw new Error(`Missing ${name} in ${file}.${why}`);
}
