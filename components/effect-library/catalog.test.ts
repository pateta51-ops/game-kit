// @vitest-environment jsdom
// K499: catalog.json holds one entry per look of every registered effect and every function effect, each valid and current.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createVerbs, validateSpec } from '../motion-frame/index.ts';
import * as lib from './index.ts';
import { derive, demoStage, ENDS, GROUPS, registrations, withSection, type Entry } from './catalog-sync.ts';

const read = (f: string): string => readFileSync(new URL(f, import.meta.url), 'utf8');
const catalog = JSON.parse(read('./catalog.json')) as Entry[];
const GAMES = /\b(stcc|star ?trek|captain'?s chair|warps?|imperium|astra|rome|unstoppable|earthborne|rangers|ebr|jarl|7th inning|radiance|falling skies|arkham|marvel|middle-earth)\b/i;
const verbs = createVerbs<lib.EffectCtx>();
lib.registerEffects(verbs).el.remove();
const names = verbs.names();
const regs = registrations();
const isFn = (id: string): boolean => typeof (lib as Record<string, unknown>)[id] === 'function';

// K502: an option `true`, `{}` or `[{}]` names a look whose settings the demo step gives in full (an object, a list of objects)
const sameLook = (s: unknown, v: unknown): boolean => JSON.stringify(s) === JSON.stringify(v)
  || (v === true && typeof s === 'object' && s !== null)
  || (JSON.stringify(v) === '{}' && typeof s === 'object' && s !== null && !Array.isArray(s))
  || (JSON.stringify(v) === '[{}]' && Array.isArray(s) && s.length > 0);
function problems(entries: readonly Entry[]): string[] {
  const out: string[] = [];
  const fns = entries.filter((e) => !names.includes(e.id)).map((e) => e.id);
  for (const n of names) if (!entries.some((e) => e.id === n)) out.push(`${n}: registered, no catalog entry`);
  const seen = new Set<string>();
  // K506: notThis and pairs name an entry's id or old id, with an option after `--` (as strips are named)
  const known = (r: string): boolean => {
    const [b, rest] = r.split('--');
    return entries.some((e) => (e.id === b || (e.was ?? []).includes(b!)) && (rest === undefined || Object.keys({ ...e.option, ...e.options }).some((k) => rest === k || rest.startsWith(k + '-'))));
  };
  for (const e of entries) {
    const at = `${e.id}${e.option ? ` ${JSON.stringify(e.option)}` : ''}`;
    if (seen.has(at)) out.push(`${at}: listed twice`);
    seen.add(at);
    if (!names.includes(e.id) && !isFn(e.id)) out.push(`${at}: neither a registered effect nor an exported function`);
    for (const k of ['title', 'looks', 'use'] as const) if (typeof e[k] !== 'string' || !e[k].trim()) out.push(`${at}: ${k} missing`);
    if (!Array.isArray(e.was)) out.push(`${at}: was missing`);
    if (!Array.isArray(e.notThis)) out.push(`${at}: notThis missing`);
    else for (const n of e.notThis) if (!known(n.id) || typeof n.diff !== 'string' || !n.diff.trim()) out.push(`${at}: notThis ${n.id} is not an effect or has no diff`);
    if (!Array.isArray(e.pairs)) out.push(`${at}: pairs missing`);
    else for (const n of e.pairs) if (!known(n)) out.push(`${at}: pairs ${n} is not an effect`);
    if (e.impactMs !== null && !(typeof e.impactMs === 'number' && e.impactMs >= 0 && typeof e.ms === 'number' && e.impactMs <= e.ms)) out.push(`${at}: impactMs is neither null nor within 0 to ms`);
    if (!Array.isArray(e.tags) || e.tags.length < 3 || e.tags.length > 8) out.push(`${at}: needs 3 to 8 tags`);
    if (typeof e.title === 'string' && e.title.split(/\s+/).length > 8) out.push(`${at}: title over 8 words`);
    if (!GROUPS.includes(e.group)) out.push(`${at}: group ${String(e.group)} is not one of ${GROUPS.join(', ')}`);
    if (!ENDS.includes(e.ends)) out.push(`${at}: ends ${String(e.ends)} is not one of ${ENDS.join(', ')}`);
    if (typeof e.options !== 'object' || Object.keys(e.options).length > 5) out.push(`${at}: options missing or over five`);
    if (GAMES.test(e.title) || (e.tags ?? []).some((t) => GAMES.test(t))) out.push(`${at}: a game's name in the title or tags`);
    if (typeof e.demo !== 'object') {
      out.push(`${at}: demo missing`);
      continue;
    }
    out.push(...validateSpec(e.demo, demoStage, [...names, ...fns]).map((p) => `${at}: demo ${p}`));
    const step = e.demo.steps.find((s) => s.do === e.id);
    if (!step) out.push(`${at}: demo does not play ${e.id}`);
    else for (const [k, v] of Object.entries(e.option ?? {})) if (!sameLook((step as Record<string, unknown>)[k], v)) out.push(`${at}: demo step lacks ${k}`);
    if (!step) continue;
    const d = derive(e, regs);
    for (const [k, v] of Object.entries(d)) if (JSON.stringify(e[k as keyof Entry]) !== JSON.stringify(v)) out.push(`${at}: ${k} is stale (run node components/effect-library/catalog-sync.ts)`);
    if (typeof e.since !== 'string' || !e.since) out.push(`${at}: since missing`);
    if (!Array.isArray(e.usedBy)) out.push(`${at}: usedBy missing`);
  }
  return out;
}

describe('K499 effect catalog', () => {
  it('covers every registered effect, each entry complete, its demo valid and its derived fields current', () => {
    expect(problems(catalog)).toEqual([]);
  });
  it('fails when an entry is removed, a tag list is short or a title names a game', () => {
    expect(problems(catalog.filter((e) => e.id !== 'burn-away'))).toContain('burn-away: registered, no catalog entry');
    expect(problems(catalog.map((e, j) => (j === 0 ? { ...e, tags: ['a', 'b'] } : e)))).toContain('move: needs 3 to 8 tags');
    expect(problems(catalog.map((e, j) => (j === 0 ? { ...e, title: 'Slides a piece like in Unstoppable' } : e)))).toContain("move: a game's name in the title or tags");
    expect(problems(catalog.map((e, j) => (j === 0 ? { ...e, ms: 1 } : e))).some((p) => p.startsWith('move: ms is stale'))).toBe(true);
    expect(problems([...catalog, { ...catalog[0]!, id: 'nowhere' }])).toContain('nowhere: neither a registered effect nor an exported function');
  });
  it('K506 fails when notThis or pairs name no effect, or impactMs is outside 0 to ms', () => {
    const one = (o: Partial<Entry>): string[] => problems(catalog.map((e, j) => (j === 0 ? { ...e, ...o } : e)));
    expect(one({ notThis: [{ id: 'nowhere', diff: 'x' }] })).toContain('move: notThis nowhere is not an effect or has no diff');
    expect(one({ notThis: [{ id: 'light-teleport--nomode-rise', diff: 'x' }] })).toContain('move: notThis light-teleport--nomode-rise is not an effect or has no diff');
    expect(one({ pairs: ['nowhere'] })).toContain('move: pairs nowhere is not an effect');
    expect(one({ impactMs: 401 })).toContain('move: impactMs is neither null nor within 0 to ms');
    expect(one({ impactMs: -1 })).toContain('move: impactMs is neither null nor within 0 to ms');
    expect(one({ pairs: ['dissolve', 'light-teleport--mode-rise'], impactMs: 400 })).toEqual([]);
  });
  it('the README lists the effects by group from catalog.json', () => {
    const readme = read('./README.md');
    expect(withSection(readme, catalog)).toBe(readme);
  });
  it('K505 every entry has a film strip and every group a sheet in gallery/strips', () => {
    const name = (e: Entry): string => e.id + (e.option ? '--' + Object.entries(e.option).map(([k, v]) => (typeof v === 'object' || v === true ? k : `${k}-${v as string}`)).join('-') : '');
    const has = (f: string): boolean => existsSync(join(process.cwd(), 'gallery', 'strips', `${f}.png`));
    expect(catalog.filter((e) => !has(name(e))).map(name)).toEqual([]);
    expect([...new Set(catalog.map((e) => e.group))].filter((g) => !has(`group-${g}`))).toEqual([]);
  });
});
