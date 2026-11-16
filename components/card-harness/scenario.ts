// The scenario builder: an exact position put in place fast (given cards in given places, any other field set by the
// test), then tasks run and prompts answered through the game's own rules, recording the events, the prompt left open
// and every choice the engine settled without asking (the game's probe). Deterministic: the game's seed, no clock.
import { advance, applyAction, type Draft, type GameRules, type GameTypes } from '../engine-core';
import type { Probe } from './probe';

/** What a game gives the builder. `W`: where a card can go; `D`: what the game's probe notes. */
export interface ScenarioGame<G extends GameTypes, W, D = never> {
  readonly rules: GameRules<G>;
  readonly content: G['content'];
  /** The state a scenario starts from (a new game with the dealt cards cleared, a blank board). */
  start(): G['state'];
  /** Put a new instance of card `card` at `where` in `s`; return its instance id. */
  put(s: Draft<G['state']>, card: string, where: W): string;
  readonly probe?: Probe<D>;
  /** The effects now registered (any JSON-able value each); `done()` fails when two are equal. */
  effects?(s: G['state']): readonly unknown[];
}

export interface ScenarioStep<G extends GameTypes, D> {
  readonly what: string;
  readonly prompt: G['prompt'] | null;
  readonly events: readonly G['event'][];
  readonly notes: readonly D[];
}

export class Scenario<G extends GameTypes, W, D = never> {
  readonly history: ScenarioStep<G, D>[] = [];
  s: G['state'];
  private checked: boolean;
  private scripted: string[][] = [];
  private strict: boolean;

  constructor(
    readonly game: ScenarioGame<G, W, D>,
    { validate = true, strict = false, from }: { validate?: boolean; strict?: boolean; from?: { state: G['state']; events: readonly G['event'][] } } = {},
  ) {
    this.s = from === undefined ? game.start() : structuredClone(from.state);
    this.checked = !validate;
    this.strict = strict;
    if (from !== undefined) this.history.push({ what: 'start', prompt: this.s.prompt, events: from.events, notes: [] });
  }

  /** Edit the position (a copy: earlier states stay as they were). */
  set(fn: (s: Draft<G['state']>) => void): this {
    const s = structuredClone(this.s) as Draft<G['state']>;
    fn(s);
    this.s = s;
    return this;
  }

  /** New instances of `cards` at `where`; their instance ids, in order. */
  put(where: W, ...cards: string[]): string[] {
    const ids: string[] = [];
    this.set((s) => {
      for (const c of cards) ids.push(this.game.put(s, c, where));
    });
    return ids;
  }

  /** The rules' invariants on the built position; throws naming each one broken. */
  validate(): this {
    const v = this.game.rules.invariants?.(this.s, this.game.content, []) ?? [];
    if (v.length > 0) throw new Error(`Invalid scenario: ${v.map((x) => `${x.id}: ${x.message}`).join('; ')}`);
    this.checked = true;
    return this;
  }

  private record(what: string, fn: () => { state: G['state']; events: readonly G['event'][] }): this {
    if (!this.checked) this.validate();
    const run = (): readonly G['event'][] => {
      const r = fn();
      this.s = r.state;
      return r.events;
    };
    const { result, notes } = this.game.probe?.trace(run) ?? { result: run(), notes: [] };
    this.history.push({ what, prompt: this.s.prompt, events: result, notes });
    const next = this.s.prompt === null ? undefined : this.scripted.shift();
    return next === undefined ? this : this.answer(...next);
  }

  /** Script answers (each a list of picks) for the prompts that open next, in order; a prompt opened is answered at once. */
  script(...answers: string[][]): this {
    this.scripted.push(...answers);
    return this;
  }

  /** A check between steps: `fn` returns false or a message to fail; the error names the label and the last step. */
  check(label: string, fn: (s: G['state']) => boolean | string | void): this {
    const r = fn(this.s);
    if (r === false || typeof r === 'string')
      throw new Error(`Check "${label}" failed after step ${String(this.history.length)} (${this.history.at(-1)?.what ?? 'none'})${typeof r === 'string' ? `: ${r}` : ''}`);
    return this;
  }

  /** Teardown: fails on a scripted answer left over, an open prompt (strict), or two equal registered effects. */
  done(): this {
    if (this.scripted.length > 0) throw new Error(`Unused scripted answers: ${this.scripted.map((a) => `[${a.join(', ')}]`).join(' ')}`);
    if (this.strict && this.s.prompt !== null)
      throw new Error(`Unanswered prompt ${String(this.s.prompt.id)}: options ${this.options().join(', ')}`);
    const seen = new Set<string>();
    for (const e of this.game.effects?.(this.s) ?? []) {
      const k = JSON.stringify(e);
      if (seen.has(k)) throw new Error(`Duplicate effect: ${k}`);
      seen.add(k);
    }
    return this;
  }

  /** Push `tasks` (the first runs first) and run the stack until a prompt opens: a card's effect resolved directly. */
  run(...tasks: G['task'][]): this {
    this.set((s) => {
      for (let i = tasks.length - 1; i >= 0; i -= 1) (s.stack as unknown[]).push(structuredClone(tasks[i]));
    });
    return this.record(`run ${tasks.map((t) => t.kind).join(', ')}`, () =>
      advance(this.game.rules, this.s, this.game.content),
    );
  }

  /** Answer the open prompt with `picks` (option ids). Throws when the rules refuse. */
  answer(...picks: string[]): this {
    if (this.strict && this.s.prompt === null) throw new Error(`Answer [${picks.join(', ')}] given but no prompt is open`);
    const promptId = this.s.prompt?.id ?? -1;
    return this.record(`answer ${picks.join(', ')}`, () =>
      applyAction(this.game.rules, this.s, { kind: 'answer', promptId, picks }, this.game.content),
    );
  }

  get prompt(): G['prompt'] | null {
    return this.s.prompt;
  }
  /** The enabled option ids of the open prompt. */
  options(): string[] {
    return (this.s.prompt?.options ?? []).filter((o) => o.enabled).map((o) => o.id);
  }
  /** Is option `id` offered and enabled? */
  offered(id: string): boolean {
    return this.options().includes(id);
  }
  get events(): G['event'][] {
    return this.history.flatMap((h) => h.events);
  }
  /** Every choice the engine settled since the scenario was built. */
  get notes(): D[] {
    return this.history.flatMap((h) => h.notes);
  }
  /** `read` before and after `fn` (a before/after delta). */
  observe<T>(read: (s: G['state']) => T, fn: (sc: this) => void): { before: T; after: T } {
    const before = structuredClone(read(this.s));
    fn(this);
    return { before, after: read(this.s) };
  }
}
