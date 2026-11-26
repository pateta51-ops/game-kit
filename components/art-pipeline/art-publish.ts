// Copies the chosen picture of each card from the index to the game's public folder and writes the manifest that
// tooling-scripts/art-check.ts reads. The chosen sources are staged flat as `<stage>/<name>.<ext>` (the folder art-check calls
// `--sources`, with its default `--source-id`); the outputs go to `<out>/<name>.<ext>`; the manifest maps name -> { source, sha256, bytes,
// outSha256, id, width, height }. A picture of another format than `ext` is converted (the built-in codec: PNG only; else `sharp`).
// Config: { index, root, stage, out, manifest, ext, sharp? } (paths relative to the config file; the index's files relative to `root`).
// quality?: { min, max? } (or per face in faces: { <id>: { quality, maxFileBytes } }) encodes a converted picture at the highest quality up to max (100) that fits maxFileBytes, never below min; a face that does not fit at min fails the run.
// The manifest also holds the source's pixel size (sourceWidth, sourceHeight) for art-check's enlarged rule.
// Check afterwards: node tooling-scripts/art-check.ts --manifest <manifest> --sources <stage> --out <out> --ext <ext>.
// Exit 0, 2 usage or a failed read.
import { accessSync, constants, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, parse, relative, resolve } from 'node:path';
import { isMain, stdio, type Io } from '../tooling-scripts/args.ts';
import type { ArtIndex } from './art-index.ts';
import { codec, encodeWithin, fail, imageSize, load, safeName, sha256, type Codec } from './lib.ts';
import { beginPublication, publicationPath, recoverPublication, withinPublicationPath as within } from './publication.ts';

const USAGE = 'usage: node art-publish.ts --config <json> [--recover]';

export type Quality = { min: number; max?: number };

export async function run(args: readonly string[], io: Io = stdio, codecOverride?: Codec): Promise<number> {
  let publication: ReturnType<typeof beginPublication> | undefined;
  try {
    const l = load(args, ['recover']);
    if (l === null || l.pos.length > 0) {
      io.err(USAGE);
      return 2;
    }
    const c = l.config as { index: string; root: string; stage: string; out: string; manifest: string; ext: string; sharp?: string; quality?: Quality; maxFileBytes?: number; faces?: Record<string, { quality?: Quality; maxFileBytes?: number }> };
    const [root, stage, out] = [resolve(l.dir, c.root), resolve(l.dir, c.stage), resolve(l.dir, c.out)];
    const manifestFile = resolve(l.dir, c.manifest);
    const configFile = resolve(args[args.lastIndexOf('--config') + 1]!);
    if (process.platform === 'win32' && [stage, out, manifestFile, configFile].some((p) => /[ .](?:\\|$)|:/.test(p.slice(parse(p).root.length)))) throw new Error('ambiguous Windows publication path');
    if (within(stage, out) || within(out, stage) || within(manifestFile, stage) || within(manifestFile, out)) throw new Error('stage, out and manifest must be distinct; stage and out cannot contain each other');
    const targets = [stage, out];
    const manifestGroup = targets.findIndex((target) => within(target, manifestFile));
    if (manifestGroup < 0) targets.push(manifestFile);
    const actualTargets = targets.map(publicationPath);
    const actualConfig = publicationPath(configFile);
    if (targets.some((p) => within(p, configFile)) || actualTargets.some((p) => within(p, actualConfig))) throw new Error('publication cannot replace its config');
    const marker = `${configFile}.publish-state.json`;
    if (l.bools.has('recover')) {
      recoverPublication(targets, marker);
      io.out('art-publish: recovered the interrupted publication; run again to publish');
      return 0;
    }
    const indexFile = resolve(l.dir, c.index);
    const actualIndex = publicationPath(indexFile);
    const index = JSON.parse(readFileSync(indexFile, 'utf8')) as ArtIndex;
    if (!index || typeof index.defs !== 'object' || index.defs === null || Array.isArray(index.defs) || Object.keys(index.defs).length === 0) throw new Error('index.defs must select at least one logical ID');
    if (!/^[a-z0-9]+$/i.test(c.ext)) throw new Error('ext must be a file extension without a dot');
    const names = new Map<string, string>();
    const selected = Object.entries(index.defs).sort().map(([id, file]) => {
      const name = safeName(id);
      if (!name || name === '.' || name === '..' || typeof file !== 'string' || !file) throw new Error(`invalid selected face: ${id}`);
      const previous = names.get(name.toLowerCase());
      if (previous !== undefined) throw new Error(`filename collision: ${previous} and ${id} map to ${name}`);
      names.set(name.toLowerCase(), id);
      const src = resolve(root, file);
      const extension = extname(file);
      const stageName = name + (extension.length > 1 ? extension : '.source');
      const actualSource = publicationPath(src);
      if (targets.some((p) => within(p, src) || within(p, indexFile)) || actualTargets.some((p) => within(p, actualSource) || within(p, actualIndex))) throw new Error(`publication would replace an input: ${id}`);
      if (within(join(stage, stageName), manifestFile) || within(join(out, `${name}.${c.ext}`), manifestFile)) throw new Error(`manifest would replace face ${id}`);
      if (!statSync(src).isFile()) throw new Error(`${id}: source is not a file`);
      accessSync(src, constants.R_OK);
      return { id, name, file, src, stageName };
    });
    const cod = codecOverride ?? await codec(c.sharp);
    publication = beginPublication(targets, marker);
    const [nextStage, nextOut] = publication.paths as [string, string];
    for (const d of [nextStage, nextOut]) mkdirSync(d, { recursive: true });
    const manifest: Record<string, object> = Object.create(null) as Record<string, object>;
    for (const { id, name, file, src, stageName } of selected) {
      const bytes = readFileSync(src);
      writeFileSync(join(nextStage, stageName), bytes);
      const made = extname(file).slice(1).toLowerCase() === c.ext ? bytes : await (() => { const q = c.faces?.[id]?.quality ?? c.quality; return q ? encodeWithin(cod, bytes, c.ext, id, q, c.faces?.[id]?.maxFileBytes ?? c.maxFileBytes) : cod.out(bytes, c.ext); })();
      const cap = c.faces?.[id]?.maxFileBytes ?? c.maxFileBytes;
      if (cap !== undefined && (!Number.isSafeInteger(cap) || cap < 0 || made.length > cap)) throw new Error(`${id}: ${String(made.length)} bytes is over the file cap of ${String(cap)}`);
      writeFileSync(join(nextOut, `${name}.${c.ext}`), made);
      const size = imageSize(made);
      const from = imageSize(bytes);
      manifest[name] = { source: stageName, sha256: sha256(bytes), bytes: made.length, outSha256: sha256(made), id, ...(size ? { width: size[0], height: size[1] } : {}), ...(from ? { sourceWidth: from[0], sourceHeight: from[1] } : {}) };
    }
    const nextManifest = manifestGroup < 0 ? publication.paths[2]! : join(publication.paths[manifestGroup]!, relative(targets[manifestGroup]!, manifestFile));
    mkdirSync(dirname(nextManifest), { recursive: true });
    writeFileSync(nextManifest, JSON.stringify(manifest, null, 1) + '\n');
    publication.commit();
    io.out(`art-publish: ${String(Object.keys(manifest).length)} pictures to ${c.out}`);
    return 0;
  } catch (e) {
    if (publication) try { publication.abort(); } catch (recovery) { io.err(`art-publish: recovery incomplete; keep the publish-state file and backups, then run --recover: ${recovery instanceof Error ? recovery.message : String(recovery)}`); }
    return fail(io, 'art-publish', e);
  }
}

if (isMain(import.meta.url)) process.exitCode = await run(process.argv.slice(2));
