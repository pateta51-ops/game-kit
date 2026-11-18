// The scenario builder: an exact position put in place fast (given cards in given places, any other field set by the
// test), then tasks run and prompts answered through the game's own rules, recording the events, the prompt left open
// and every choice the engine settled without asking (the game's probe). Deterministic: the game's seed, no clock.
import { advance, applyAction, portAnswer, portOptions, portSettle, type Draft, type EnginePort, type GameRules, type GameTypes, type InvariantViolation, type PortTypes } from '../engine-core/index.ts';
import type { Probe } from './probe.ts';

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

/** K390: a game with its own engine passes a port (`put` and `push` for `put` and `run`). */
export interface ScenarioPort<G extends PortTypes, W, D = never> extends EnginePort<G, W> {
  readonly probe?: Probe<D>;
  effects?(s: G['state']): readonly unknown[];
}

interface Driver<G extends PortTypes, W> {
  settle(s: G['state']): { state: G['state']; events: readonly G['event'][] };
  answer(s: G['state'], promptId: number | string, picks: string[]): { state: G['state']; events: readonly G['event'][] };
  prompt(s: G['state']): G['prompt'] | null;
  options(s: G['state']): readonly string[];
  invariants(s: G['state']): readonly InvariantViolation[];
  put(s: Draft<G['state']>, card: string, where: W): string;
  push(s: Draft<G['state']>, tasks: readonly G['task'][]): void;
}

type K = GameTypes['state'];
function driver<G extends PortTypes, W, D>(game: ScenarioGame<G & GameTypes, W, D> | ScenarioPort<G, W, D>): Driver<G, W> {
  if ('rules' in game) {
    const { rules, content } = game;
    return {
      settle: (s) => advance(rules, s as G['state'] & K, content),
      answer: (s, promptId, picks) => applyAction(rules, s as G['state'] & K, { kind: 'answer', promptId: promptId as number, picks }, content),
      prompt: (s) => (s as K).prompt,
      options: (s) => ((s as K).prompt?.options ?? []).filter((o) => o.enabled).map((o) => o.id),
      invariants: (s) => rules.invariants?.(s as G['state'] & K, content, []) ?? [],
      put: (s, card, where) => game.put(s as Draft<G['state'] & K>, card, where),
      push: (s, tasks) => {
        for (let i = tasks.length - 1; i >= 0; i -= 1) (s as { stack: unknown[] }).stack.push(structuredClone(tasks[i]));
      },
    };
  }
  const port = game as unknown as EnginePort<G>;
  return {
    settle: (s) => portSettle(port, s),
    answer: (s, promptId, picks) => portAnswer(port, s, { kind: 'answer', promptId, picks }),
    prompt: (s) => game.prompt(s),
    options: (s) => portOptions(port, s),
    invariants: (s) => game.invariants?.(s, game.content) ?? [],
    put: (s, card, where) => {
      if (game.put === undefined) throw new Error('This engine port has no put');
      return game.put(s, card, where);
    },
    push: (s, tasks) => {
      if (game.push === undefined) throw new Error('This engine port has no push: run() takes no tasks');
      game.push(s, tasks);
    },
  };
}

export interface ScenarioStep<G extends PortTypes, D> {
  readonly what: string;
  readonly prompt: G['prompt'] | null;
  readonly events: readonly G['event'][];
  readonly notes: readonly D[];
}

export class Scenario<G extends PortTypes, W, D = never> {
  readonly history: ScenarioStep<G, D>[] = [];
  s: G['state'];
  private checked: boolean;
  private scripted: string[][] = [];
  private strict: boolean;

  readonly game: ScenarioGame<G & GameTypes, W, D> | ScenarioPort<G, W, D>;
  private d: Driver<G, W>;
  constructor(
    game: ScenarioGame<G & GameTypes, W, D> | ScenarioPort<G, W, D>,
    { validate = true, strict = false, from }: { validate?: boolean; strict?: boolean; from?: { state: G['state']; events: readonly G['event'][] } } = {},
  ) {
    this.game = game;
    this.d = driver(game);
    this.s = from === undefined ? game.start() : structuredClone(from.state);
    this.checked = !validate;
    this.strict = strict;
    if (from !== undefined) this.history.push({ what: 'start', prompt: this.prompt, events: from.events, notes: [] });
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
      for (const c of cards) ids.push(this.d.put(s, c, where));
    });
    return ids;
  }

  /** The rules' invariants on the built position; throws naming each one broken. */
  validate(): this {
    const v = this.d.invariants(this.s);
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
    this.history.push({ what, prompt: this.prompt, events: result, notes });
    const next = this.prompt === null ? undefined : this.scripted.shift();
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
    if (this.strict && this.prompt !== null)
      throw new Error(`Unanswered prompt ${String(this.prompt.id)}: options ${this.options().join(', ')}`);
    const seen = new Set<string>();
    for (const e of (this.game as ScenarioPort<G, W, D>).effects?.(this.s) ?? []) {
      const k = JSON.stringify(e);
      if (seen.has(k)) throw new Error(`Duplicate effect: ${k}`);
      seen.add(k);
    }
    return this;
  }

  /** Push `tasks` (the first runs first) and run the stack until a prompt opens: a card's effect resolved directly. */
  run(...tasks: G['task'][]): this {
    if (tasks.length > 0) this.set((s) => this.d.push(s, tasks));
    return this.record(`run ${tasks.map((t) => (typeof t === 'string' ? t : String((t as { kind?: unknown }).kind))).join(', ')}`, () => this.d.settle(this.s));
  }

  /** Answer the open prompt with `picks` (option ids). Throws when the rules refuse. */
  answer(...picks: string[]): this {
    if (this.strict && this.prompt === null) throw new Error(`Answer [${picks.join(', ')}] given but no prompt is open`);
    const promptId = this.prompt?.id ?? -1;
    return this.record(`answer ${picks.join(', ')}`, () => {
      try {
        return this.d.answer(this.s, promptId, picks);
      } catch (e) {
        throw new Error(`Answer [${picks.join(', ')}] refused: ${e instanceof Error ? e.message : String(e)}\n${this.open()}`, { cause: e });
      }
    });
  }

  /** The open prompt and its enabled options as text (K102), for failure messages. */
  open(): string {
    const p = this.prompt;
    return p === null ? 'no prompt is open' : `open prompt ${String(p.id)}: ${JSON.stringify(p)}\noffered: ${this.options().join(', ') || 'none'}`;
  }
  /** K124: the open prompt narrowed to its `kind`; throws naming the kind found (or none) otherwise. */
  cast<K extends string>(kind: K): Extract<G['prompt'], { kind: K }> {
    const p = this.prompt as { kind?: unknown } | null;
    if (p === null || p.kind !== kind) throw new Error(`Expected a ${kind} prompt, found ${p === null ? 'none' : `kind ${String(p.kind)}`}\n${this.open()}`);
    return p as Extract<G['prompt'], { kind: K }>;
  }
  /** Fails when a prompt is still open, printing it (K102). */
  noPrompt(): this {
    if (this.prompt !== null) throw new Error(`A prompt is left open: ${this.open()}`);
    return this;
  }
  /** Run `fn`, then check each `[label, read, delta]` moved by exactly `delta`; one failure lists every pair off (K102). */
  changed(pairs: readonly (readonly [string, (s: G['state']) => number, number])[], fn: (sc: this) => void): this {
    const before = pairs.map(([, read]) => read(this.s));
    fn(this);
    const bad = pairs.flatMap(([label, read, want], i) => {
      const b = before[i] as number;
      const a = read(this.s);
      return a - b === want ? [] : [`${label}: ${String(b)} -> ${String(a)}, wanted ${want >= 0 ? '+' : ''}${String(want)}`];
    });
    if (bad.length > 0) throw new Error(`Not changed as expected after step ${String(this.history.length)}:\n${bad.join('\n')}`);
    return this;
  }
  /** The live state as a scenario literal to paste into a test (K102). */
  literal(): string {
    return scenarioLiteral(this.s, this.events);
  }
  /** Run `fn` here, then put the position and history back: an "and if instead" branch in one test (K102). */
  withRewind<T>(fn: (sc: this) => T): T {
    const s = this.s;
    const h = this.history.length;
    const scripted = this.scripted;
    this.scripted = [];
    try {
      return fn(this);
    } finally {
      this.s = s;
      this.history.length = h;
      this.scripted = scripted;
    }
  }

  get prompt(): G['prompt'] | null {
    return this.d.prompt(this.s);
  }
  /** The enabled option ids of the open prompt. */
  options(): string[] {
    return [...this.d.options(this.s)];
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

/** `{ from: { state, events } }` source for `new Scenario(game, ...)`: paste a bug report state as a test (K102). */
export function scenarioLiteral(state: unknown, events: readonly unknown[] = []): string {
  return `{ from: { state: ${JSON.stringify(state, null, 2)}, events: ${JSON.stringify(events)} } }`;
}

/** `errata` and `faq` group wrappers over the runner describe, so the ruling source is in the test name (K102). */
export function rulingGroups(describe: (name: string, fn: () => void) => unknown): {
  errata: (source: string, fn: () => void) => unknown;
  faq: (source: string, fn: () => void) => unknown;
} {
  return { errata: (s, fn) => describe(`errata: ${s}`, fn), faq: (s, fn) => describe(`faq: ${s}`, fn) };
}
