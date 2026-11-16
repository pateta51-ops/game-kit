import { emptyLog, readLog, type CampaignLog } from './log';

export type StepKind = 'prologue' | 'scenario' | 'interlude' | 'upgrade' | 'epilogue' | 'side';
/** A step; a detour (upgrade, side scenario) carries in `then` the step to return to. */
export interface Step { kind: StepKind; id: string; part?: number; then?: Step }
export interface Attempt { step: Step; seed: number; logBefore: CampaignLog; outcome?: string; resolution?: string; at?: number }
export interface CampaignSave {
  v: 1;
  id: string;
  version: string;
  log: CampaignLog;
  position: { step: Step | null; done: string[]; resolutions: Record<string, string> };
  seed: number;
  history: Attempt[];
  attempt?: Attempt;
  status: 'active' | 'over' | 'incompatible';
}
/** The game's flow: the step after the one just done (`save.position.done` and `resolutions` say what was played); null ends the campaign. */
export type NextStep = (s: CampaignSave) => Step | null;

/** Which step this is, without part or return step: `kind:id`. */
export const stepKey = (s: Step) => `${s.kind}:${s.id}`;
export const played = (s: CampaignSave, step: Step) => s.position.done.includes(stepKey(step));

/** A linear campaign: the first step of the list not yet played. */
export const linear = (steps: readonly Step[]): NextStep => (s) => steps.find((x) => !played(s, x)) ?? null;

export function newCampaign(id: string, version: string, first: Step, seed: number, log = emptyLog()): CampaignSave {
  return { v: 1, id, version, log, position: { step: first, done: [], resolutions: {} }, seed, history: [], status: 'active' };
}
/** A scenario played alone: a campaign that ends after its one step. */
export const standalone = (step: Step, seed: number, version = '0') => newCampaign('standalone', version, step, seed);
export const endsAfterOne: NextStep = () => null;

/** Leaves the current step for a detour that comes back to it. */
export function detour(s: CampaignSave, kind: StepKind, id: string): CampaignSave {
  if (!s.position.step) return s;
  return { ...s, position: { ...s.position, step: { kind, id, then: s.position.step } } };
}

function frozen<T>(x: T): T {
  const c = structuredClone(x);
  const f = (o: unknown) => {
    if (typeof o !== 'object' || o === null) return;
    Object.freeze(o);
    for (const v of Object.values(o)) f(v);
  };
  f(c);
  return c;
}

/** Starts the current step: the game gets a frozen copy of the log and never reads the campaign. */
export function begin(s: CampaignSave, seed = s.seed + s.history.length, at?: number): { save: CampaignSave; log: CampaignLog } {
  const step = s.position.step;
  if (!step || s.status !== 'active') throw new Error('campaign: no step to begin');
  const attempt: Attempt = { step, seed, logBefore: structuredClone(s.log), ...(at === undefined ? {} : { at }) };
  return { save: { ...s, attempt }, log: frozen(s.log) };
}

/** The game hands back the log it wrote at the end; the attempt goes into history and the position moves on (a detour returns to its step). */
export function end(s: CampaignSave, r: { log: CampaignLog; outcome?: string; resolution?: string }, next: NextStep): CampaignSave {
  const a = s.attempt;
  if (!a || s.status !== 'active') throw new Error('campaign: no step in progress');
  const key = stepKey(a.step);
  const done = s.position.done.includes(key) ? s.position.done : [...s.position.done, key];
  const resolutions = r.resolution === undefined ? s.position.resolutions : { ...s.position.resolutions, [key]: r.resolution };
  const h: Attempt = { ...a, ...(r.outcome === undefined ? {} : { outcome: r.outcome }), ...(r.resolution === undefined ? {} : { resolution: r.resolution }) };
  const base: CampaignSave = { ...s, log: structuredClone(r.log), history: [...s.history, h], position: { ...s.position, done, resolutions } };
  delete base.attempt;
  const step = a.step.then ?? next(base);
  return { ...base, position: { ...base.position, step }, status: step ? 'active' : 'over' };
}

/** Plays the last step again: the log goes back to the snapshot taken when it began. */
export function retry(s: CampaignSave): CampaignSave {
  const a = s.attempt ?? s.history[s.history.length - 1];
  if (!a) return s;
  const key = stepKey(a.step);
  const resolutions = { ...s.position.resolutions };
  if (!s.attempt) delete resolutions[key];
  const r: CampaignSave = {
    ...s, log: a.logBefore, status: 'active',
    position: { step: a.step, done: s.attempt ? s.position.done : s.position.done.filter((k) => k !== key), resolutions },
  };
  delete r.attempt;
  return r;
}

/** Reads a stored save; undefined when it is not one. A version other than the game's marks it incompatible instead of misreading it. */
export function readSave(x: unknown, version: string): CampaignSave | undefined {
  if (typeof x !== 'object' || x === null) return undefined;
  const o = x as CampaignSave;
  const log = readLog(o.log);
  if (o.v !== 1 || !log || !o.position) return undefined;
  return { ...o, log, status: o.version === version ? o.status : 'incompatible' };
}
