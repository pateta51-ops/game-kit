// The pure half: a motion spec, a stage and a speed factor give a timeline. No DOM, no timers.
export type Rect = readonly [number, number, number, number];
export type Point = readonly [number, number];
export type Stage = (zone: string) => Rect | undefined;
export type Frequency = 'constant' | 'often' | 'each round' | 'rare' | 'once';

export interface Actor {
  id: string;
  label?: string;
  at: string | Point;
  w?: number;
  h?: number;
  hidden?: boolean;
}
export interface Step {
  t: number;
  dur: number;
  actor: string;
  do: string;
  to?: string | Point | number;
  [more: string]: unknown;
}
export interface MotionSpec {
  id: string;
  stage?: string;
  frequency?: Frequency;
  maxMs?: number;
  actors?: readonly Actor[];
  steps: readonly Step[];
  sound?: readonly { t: number; cue: string }[];
  [more: string]: unknown;
}

export interface VerbCall {
  t: number;
  dur: number;
  actor: string;
  /** true when `actor` names a zone of the stage, not an actor of the spec */
  zone: boolean;
  verb: string;
  from: Rect;
  /** a move's destination: the actor's size, centred on the target */
  to?: Rect;
  /** a number given as `to` (a scale factor) */
  value?: number;
  step: Step;
}
export interface Timeline {
  id: string;
  ms: number;
  actors: { id: string; label: string; rect: Rect; hidden: boolean }[];
  calls: VerbCall[];
  cues: { t: number; cue: string }[];
}

export interface Layout {
  zones: Record<string, Rect | { r: Rect }>;
}

const isPoint = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number');

/** A stage from a layout JSON (`zones[id]` is `[x, y, w, h]` or `{ r }`); `live` is asked first (dynamic targets). */
export function stageFromLayout(layout: Layout, live?: Stage): Stage {
  return (zone) => {
    const z = live?.(zone) ?? layout.zones[zone];
    if (z === undefined) return undefined;
    return 'r' in z ? z.r : z;
  };
}

const centred = (c: Point, w: number, h: number): Rect => [c[0] - w / 2, c[1] - h / 2, w, h];
const centreOf = (r: Rect): Point => [r[0] + r[2] / 2, r[1] + r[3] / 2];

function place(at: string | Point, stage: Stage, w?: number, h?: number): Rect | undefined {
  if (isPoint(at)) return centred(at, w ?? 0, h ?? 0);
  const z = stage(at);
  return z && centred(centreOf(z), w ?? z[2], h ?? z[3]);
}

/** Times are multiplied by `factor` (1 normal, 0.5 twice as fast). Throws on what `validateSpec` reports. */
export function buildTimeline(spec: MotionSpec, stage: Stage, factor = 1): Timeline {
  const ms = (n: number): number => Math.round(n * factor);
  const fail = (m: string): never => {
    throw new Error(`motion-frame ${spec.id}: ${m}`);
  };
  const now = new Map<string, Rect>();
  const actors = (spec.actors ?? []).map((a) => {
    const rect = place(a.at, stage, a.w, a.h) ?? fail(`actor ${a.id}: zone ${String(a.at)} is not on the stage`);
    now.set(a.id, rect);
    return { id: a.id, label: a.label ?? a.id, rect, hidden: a.hidden === true };
  });
  const calls = spec.steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.t - b.s.t || a.i - b.i)
    .map(({ s }): VerbCall => {
      const own = now.get(s.actor);
      const from = own ?? stage(s.actor) ?? fail(`step actor ${s.actor} is neither an actor nor a zone`);
      const call: VerbCall = { t: ms(s.t), dur: ms(s.dur), actor: s.actor, zone: own === undefined, verb: s.do, from, step: s };
      if (typeof s.to === 'number') call.value = s.to;
      else if (s.to !== undefined) {
        const to = place(s.to, stage, from[2], from[3]) ?? fail(`step target ${String(s.to)} is not on the stage`);
        call.to = to;
        if (own !== undefined) now.set(s.actor, to);
      }
      return call;
    });
  return {
    id: spec.id,
    ms: calls.reduce((m, c) => Math.max(m, c.t + c.dur), 0),
    actors,
    calls,
    cues: [...(spec.sound ?? [])].sort((a, b) => a.t - b.t).map((c) => ({ t: ms(c.t), cue: c.cue })),
  };
}

const FREQ = ['constant', 'often', 'each round', 'rare', 'once'];

/** The problems of one spec, as lines; empty when it is sound. `verbs` is the registry or a list of names. */
export function validateSpec(raw: unknown, stage: Stage, verbs: { has(name: string): boolean } | readonly string[]): string[] {
  const out: string[] = [];
  const known = (v: string): boolean => ('has' in verbs ? verbs.has(v) : verbs.includes(v));
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (typeof raw !== 'object' || raw === null) return ['not an object'];
  const spec = raw as Partial<MotionSpec>;
  if (typeof spec.id !== 'string' || !spec.id) out.push('id missing');
  if (spec.frequency !== undefined && !FREQ.includes(spec.frequency)) out.push(`frequency ${String(spec.frequency)} is not one of ${FREQ.join(', ')}`);
  if (!num(spec.maxMs)) out.push(spec.maxMs === undefined ? 'maxMs missing' : 'maxMs is not a number');
  if (!Array.isArray(spec.steps)) return [...out, 'steps missing'];
  const ids = new Set<string>();
  for (const a of Array.isArray(spec.actors) ? (spec.actors as Partial<Actor>[]) : []) {
    if (typeof a.id !== 'string' || !a.id) {
      out.push('actor without id');
      continue;
    }
    if (ids.has(a.id)) out.push(`actor ${a.id} is listed twice`);
    ids.add(a.id);
    if (typeof a.at === 'string') {
      if (stage(a.at) === undefined) out.push(`actor ${a.id}: zone ${a.at} is not on the stage`);
    } else if (!isPoint(a.at)) out.push(`actor ${a.id}: at is neither a zone nor [x, y]`);
    else if (!num(a.w) || !num(a.h)) out.push(`actor ${a.id}: at is a point, so w and h are needed`);
  }
  let end = 0;
  (spec.steps as Partial<Step>[]).forEach((s, i) => {
    const n = `step ${String(i + 1)}`;
    if (!num(s.t) || !num(s.dur)) out.push(`${n}: t and dur must be numbers`);
    else end = Math.max(end, s.t + s.dur);
    if (typeof s.do !== 'string') out.push(`${n}: no verb`);
    else if (!known(s.do)) out.push(`${n}: unknown verb ${s.do}`);
    if (typeof s.actor !== 'string') out.push(`${n}: no actor`);
    else if (!ids.has(s.actor) && stage(s.actor) === undefined) out.push(`${n}: ${s.actor} is neither an actor nor a zone`);
    if (typeof s.to === 'string') {
      if (stage(s.to) === undefined) out.push(`${n}: zone ${s.to} is not on the stage`);
    } else if (s.to !== undefined && typeof s.to !== 'number' && !isPoint(s.to)) out.push(`${n}: to is not a zone, [x, y] or a number`);
  });
  if (num(spec.maxMs) && end > spec.maxMs) out.push(`the last step ends at ${String(end)} ms, after maxMs ${String(spec.maxMs)}`);
  for (const c of Array.isArray(spec.sound) ? (spec.sound as { t?: unknown; cue?: unknown }[]) : [])
    if (!num(c.t) || typeof c.cue !== 'string' || !c.cue) out.push('sound mark needs t and cue');
    else if (c.t > end) out.push(`cue ${c.cue} at ${String(c.t)} ms is after the last step's end (${String(end)} ms)`);
  return out;
}

/** Every spec against the stage its `stage` field names; lines start with the spec id. For a game's check script. */
export function validateSpecs(
  specs: Readonly<Record<string, unknown>>,
  stages: Readonly<Record<string, Stage>>,
  verbs: { has(name: string): boolean } | readonly string[],
): string[] {
  return Object.entries(specs).flatMap(([name, spec]) => {
    const st = (spec as { stage?: unknown } | null)?.stage;
    const stage = st === undefined ? stages['default'] : typeof st === 'string' ? stages[st] : undefined;
    if (stage === undefined) return [`${name}: stage ${String(st)} is not known`];
    return validateSpec(spec, stage, verbs).map((p) => `${name}: ${p}`);
  });
}
