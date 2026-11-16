// K153: a story beat as an engine question (idea from ArkhamHorror storyWithChooseOne / *StepPart; written new). The
// beat is a task on the engine stack and its question a prompt, so it saves, replays and undoes like play; a long beat
// is split into parts, each its own question, so a save between parts resumes at the part reached.
import type { Ctx, GameTypes, HandlerTable, KernelOption, KernelTask } from '../engine-core/index';
import { findScenario, resolveBeat, type Beat, type SeenBeat, type Story } from './story';

export type BeatAsk =
  | { kind: 'read' }
  | { kind: 'choose'; choices: readonly { id: string; label: string; enabled?: boolean; why?: string }[] }
  | { kind: 'card'; cards: readonly { id: string; faceDown?: boolean }[]; min?: number; max?: number }
  | { kind: 'character'; characters: readonly string[]; min?: number; max?: number };

/** The beat's question: `ask` (default read on), its lines split into parts of `split` lines (default one part). */
export type AskBeat = Beat & { id: string; ask?: BeatAsk; split?: number };

export const STORY_TASK = 'story';
export const READ_ON = 'read';
export interface StoryTask extends KernelTask { readonly kind: typeof STORY_TASK; readonly scenario: string; readonly beat: string; readonly part: number }

export const storyTask = (scenario: string, beat: string, part = 0): StoryTask => ({ kind: STORY_TASK, scenario, beat, part });

export function findBeat(s: Story, scenarioId: string, beatId: string): AskBeat | undefined {
  const sc = findScenario(s, scenarioId);
  if (!sc) return undefined;
  const all = [...Object.values(sc.slots ?? {}).flat(), ...Object.values(sc.stages ?? {}).flat(), ...sc.sheet.flatMap((p) => p.beats)];
  return all.find((b) => b.id === beatId) as AskBeat | undefined;
}

export const partCount = (b: AskBeat): number => (b.split && b.split > 0 ? Math.max(1, Math.ceil(b.lines.length / b.split)) : 1);

/** A face-down card is offered by position (`down:<index>`), so its id never reaches the prompt, the answer or the log. */
export const FACE_DOWN = 'down:';
/** The picks with each face-down position read back as its card id. */
export function realPicks(b: AskBeat | undefined, picks: readonly string[]): string[] {
  const cards = b?.ask?.kind === 'card' ? b.ask.cards : [];
  return picks.map((p) => (p.startsWith(FACE_DOWN) ? (cards[Number(p.slice(FACE_DOWN.length))]?.id ?? p) : p));
}

export interface BeatQuestion {
  /** The part's lines as read (narrator fallback applied). */
  beat: SeenBeat;
  part: number;
  of: number;
  /** The question of this part: read on, until the last part. */
  ask: BeatAsk;
  options: KernelOption[];
  min: number;
  max: number;
}

/** What the open story prompt shows and accepts; undefined when the beat is unknown. */
export function beatQuestion(s: Story, t: Pick<StoryTask, 'scenario' | 'beat' | 'part'>, inPlay: readonly string[]): BeatQuestion | undefined {
  const b = findBeat(s, t.scenario, t.beat);
  if (!b) return undefined;
  const of = partCount(b);
  const n = b.split && b.split > 0 ? b.split : b.lines.length;
  const lines = of === 1 ? b.lines : b.lines.slice(t.part * n, t.part * n + n);
  const last = t.part >= of - 1;
  const ask: BeatAsk = last && b.ask ? b.ask : { kind: 'read' };
  const beat = resolveBeat(s, last ? { ...b, lines } : { id: b.id, lines, ...(b.picture ? { picture: b.picture } : {}) }, inPlay);
  const one = (options: KernelOption[], min = 1, max = min) => ({ beat, part: t.part, of, ask, options, min, max });
  if (ask.kind === 'read') return one([{ id: READ_ON, enabled: true }]);
  if (ask.kind === 'choose') return one(ask.choices.map((c) => ({ id: c.id, enabled: c.enabled ?? true, ...(c.why ? { why: c.why } : {}) })));
  const ids = ask.kind === 'card' ? ask.cards.map((c, i) => (c.faceDown ? `${FACE_DOWN}${String(i)}` : c.id)) : ask.characters;
  return one(ids.map((id) => ({ id, enabled: true })), ask.min ?? 1, ask.max ?? ask.min ?? 1);
}

export interface StoryBeatConfig<G extends GameTypes> {
  story(ctx: Ctx<G>): Story;
  inPlay?(ctx: Ctx<G>): readonly string[];
  /** The last part was answered: the game applies the picks (a choice's effect, the picked card or character). */
  answered?(ctx: Ctx<G>, task: StoryTask, picks: readonly string[]): void;
}

/** Spread into the game's handlers; schedule a beat with `ctx.then(storyTask(scenario, beat))`. The prompt carries `story: { scenario, beat, part }`. */
export function storyHandlers<G extends GameTypes>(cfg: StoryBeatConfig<G>): HandlerTable<G> {
  return {
    [STORY_TASK]: (ctx, task) => {
      const t = task as StoryTask;
      const s = cfg.story(ctx);
      if (t.answer === undefined) {
        const q = beatQuestion(s, t, cfg.inPlay?.(ctx) ?? []);
        if (!q) throw new Error(`story: no beat ${t.beat} in ${t.scenario}`);
        ctx.then(t);
        ctx.ask({ options: q.options, min: q.min, max: q.max, story: { scenario: t.scenario, beat: t.beat, part: t.part } } as never);
        return;
      }
      const b = findBeat(s, t.scenario, t.beat);
      if (b && t.part < partCount(b) - 1) ctx.then(storyTask(t.scenario, t.beat, t.part + 1));
      else cfg.answered?.(ctx, t, realPicks(b, t.answer));
    },
  };
}

/** Beats with a question need an id unique in their scenario; choice ids unique; min <= max. */
export function beatProblems(s: Story): string[] {
  const out: string[] = [];
  for (const sc of s.scenarios) {
    const all = [...Object.values(sc.slots ?? {}).flat(), ...Object.values(sc.stages ?? {}).flat(), ...sc.sheet.flatMap((p) => p.beats)] as AskBeat[];
    const ids = all.map((b) => b.id).filter((x) => x !== undefined);
    if (new Set(ids).size !== ids.length) out.push(`${sc.id}: duplicate beat id`);
    for (const b of all) {
      if ((b.ask || b.split) && !b.id) out.push(`${sc.id}: a question beat has no id`);
      const a = b.ask;
      if (a?.kind === 'choose' && new Set(a.choices.map((c) => c.id)).size !== a.choices.length) out.push(`${sc.id}/${b.id}: duplicate choice id`);
      if (a && (a.kind === 'card' || a.kind === 'character') && (a.min ?? 1) > (a.max ?? a.min ?? 1)) out.push(`${sc.id}/${b.id}: min above max`);
    }
  }
  return out;
}
