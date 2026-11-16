// Puts a game's fonts into one folder: per role a free substitute downloaded with its licence text (a TTF or OTF saved
// under a .woff name is packed losslessly as WOFF), owner-supplied files taking the role by file-name prefix, plus files
// copied from the repository. Writes fonts.json (what each role uses) and LICENSES.md. Present files are kept unless
// --force; a failed download keeps what is there. Exit codes: 0 done, 1 a download failed, 2 usage or a failed read.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';
import { toWoff } from './woff';

export interface FontRole {
  role: string;
  /** The CSS family the game uses for this role. */
  family: string;
  /** The printed font this role stands for. */
  printed: string;
  /** Prefix of an owner-supplied file (.woff2, .woff, .ttf, .otf) in the output folder; it then takes the role. */
  ownerPrefix?: string;
  substitute: { family: string; licence: string; licenceFile: string; licenceUrl: string; files: { file: string; url: string }[] };
}
export interface FontsConfig {
  roles: FontRole[];
  /** Files of the repository copied as they are; `note` is their line in LICENSES.md. */
  copy?: { from: string; note: string }[];
}
export type Download = (url: string) => Promise<Uint8Array>;

/** True for the first bytes of a TrueType or OpenType file. */
export const looksLikeFont = (b: Uint8Array): boolean =>
  b.length > 1000 && ((b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || String.fromCharCode(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0) === 'OTTO');

const download: Download = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${String(res.status)} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
};

export function ownerFiles(dir: string, prefix: string | undefined): string[] {
  return prefix !== undefined && prefix !== '' && existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && /\.(woff2?|ttf|otf)$/i.test(f))
        .sort()
    : [];
}

export async function fontsFetch(c: FontsConfig, out: string, force: boolean, io: Io, get: Download = download): Promise<number> {
  for (const name of c.roles.flatMap((r) => [r.substitute.licenceFile, ...r.substitute.files.map((f) => f.file)])) {
    const rel = relative(out, resolve(out, name));
    if (rel === '' || rel.startsWith('.'.repeat(2)) || isAbsolute(rel)) throw new Error(`${name}: a file name must stay inside ${out}`);
  }
  mkdirSync(out, { recursive: true });
  let failed = 0;
  for (const r of c.roles) {
    const s = r.substitute;
    if (!force && existsSync(join(out, s.licenceFile)) && s.files.every((f) => existsSync(join(out, f.file)))) continue;
    try {
      for (const f of s.files) {
        const bytes = await get(f.url);
        if (!looksLikeFont(bytes)) throw new Error(`${s.family}: the answer for ${f.file} is not a font file`);
        const web = f.file.toLowerCase().endsWith('.woff') ? toWoff(bytes) : bytes;
        writeFileSync(join(out, f.file), web);
        io.out(`fonts-fetch: wrote ${f.file} (${String(web.length)} bytes)`);
      }
      writeFileSync(join(out, s.licenceFile), await get(s.licenceUrl));
    } catch (e) {
      failed += 1;
      io.err(`fonts-fetch: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const copy = c.copy ?? [];
  for (const f of copy) copyFileSync(resolve(f.from), join(out, basename(f.from)));
  const roles = c.roles.map((r) => {
    const owner = ownerFiles(out, r.ownerPrefix);
    return { role: r.role, family: r.family, printed: r.printed, source: owner.length > 0 ? 'owner' : 'substitute', files: owner.length > 0 ? owner : r.substitute.files.map((f) => f.file), substitute: r.substitute.family };
  });
  writeFileSync(join(out, 'fonts.json'), `${JSON.stringify({ roles, copied: copy.map((f) => basename(f.from)) }, null, 2)}\n`);
  const lines = [
    '# Font licences',
    '',
    'Written by fonts-fetch. A role uses the free substitute below until an owner-supplied file with its prefix is in this folder.',
    '',
    '| File | Role | Replaces | Licence |',
    '|---|---|---|---|',
    ...c.roles.flatMap((r) => r.substitute.files.map((f) => `| \`${f.file}\` (${r.substitute.family}) | ${r.role} | ${r.printed} | ${r.substitute.licence}; text in \`${r.substitute.licenceFile}\` |`)),
    ...copy.map((f) => `| \`${basename(f.from)}\` | copied | | ${f.note} |`),
    '',
  ];
  writeFileSync(join(out, 'LICENSES.md'), lines.join('\n'));
  return failed === 0 ? 0 : 1;
}

const USAGE = 'usage: tsx fonts-fetch.ts --roles <json> --out <dir> [--force] [--config <json>]';

export async function run(args: readonly string[], io: Io = stdio, get: Download = download): Promise<number> {
  try {
    const f = flags(args, ['roles', 'out'], ['force']);
    const roles = f?.['roles']?.[0];
    const out = f?.['out']?.[0];
    if (f === null || roles === undefined || out === undefined) {
      io.err(USAGE);
      return 2;
    }
    return await fontsFetch(JSON.parse(readFileSync(resolve(roles), 'utf8')) as FontsConfig, resolve(out), f['force'] !== undefined, io, get);
  } catch (error) {
    io.err(`fonts-fetch: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
