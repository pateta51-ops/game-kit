// K234: one game store over the kit's parts (engine-core step undo, prompt-host forced answers, paced-view steps, saves'
// autosave, the opponent seat on its own view), and one `defineGame` object the store, sim-pool, replay-cli and the
// opponent read. Shape from Imperium src/ui/store/gameStore.ts + history.ts (rebuild with answeredBySettings),
// Unstoppable's store + undo.ts and EBR store.ts; written new.
import { canUndoStep, createGame, extendStep, newSteps, redoStep, replaySteps, restoreSave, seatKey, undoStep, type AnswerAction, type GameRules, type GameTypes, type History, type SaveFile, type SaveFormat, type StepHistory, type UndoMode } from '../engine-core/index.ts';
import { answerWithForced, sendForced, type Forced } from '../prompt-host/index.ts';
import { advance, noSteps, pushSteps, skip, type Steps } from '../paced-view/index.ts';

export type SeatId = string | number;

/** The one object a game writes; the store and `sim.ts` (`simGameOf`, `replayEngineOf`, `opponentDriverOf`) read it. */
export interface GameDef<G extends GameTypes, V, S extends SeatId = SeatId> {
  readonly rules: GameRules<G>;
  readonly content: G['content'];
  readonly seats: readonly S[];
  /** A new game's options and rules from a seed. */
  readonly start: (seed: string) => { options: G['options']; rules: G['rules'] };
  /** What one seat sees (build it from card-zones `viewOf`); the opponent and the screen read only this. */
  readonly view: (state: G['state'], seat: S) => V;
  /** Answers the settings give without asking (prompt-host `autoAnswer`), or null to ask. Default: always ask. */
  readonly forced?: Forced<G['prompt']>;
  /** The opponent: picks for its open prompt from its own view only. */
  readonly opponent?: (view: V, prompt: G['prompt']) => readonly string[];
  /** Which events are paced as a step (default all). */
  readonly isStep?: (e: G['event']) => boolean;
  /** The game's log words per event type (table-panels `logLines`). */
  readonly words?: Readonly<Record<string, string>>;
  readonly format?: SaveFormat;
}

export const defineGame = <G extends GameTypes, V, S extends SeatId = SeatId>(def: GameDef<G, V, S>): GameDef<G, V, S> => def;

export const answerOf = (promptId: number, picks: readonly string[]): AnswerAction => ({ kind: 'answer', promptId, picks: [...picks] });

export interface GameSnap<G extends GameTypes, V> {
  readonly history: StepHistory<G>;
  readonly state: G['state'];
  /** The player's seat view of the live state. */
  readonly view: V;
  /** paced-view queue of the last click (and the opponent's answers after it). */
  readonly steps: Steps<V, G['event']>;
  readonly options: G['options'];
  readonly rules: G['rules'];
  readonly error: string | null;
}

export interface StoreOptions<S extends SeatId> {
  /** The seat that answers on this screen (read at each call: a setting may change it). */
  readonly seat: S | (() => S);
  readonly seed?: string;
  /** Undo mode (default `safe`); `afterGameOver` as engine-core. */
  readonly undo?: UndoMode | (() => UndoMode);
  readonly afterGameOver?: boolean;
  /** Skip pacing (paced-view `instant`). */
  readonly instant?: () => boolean;
  /** saves' `makeSaves(...)` (or anything with `writeAutosave`): called after each accepted answer. */
  readonly saves?: { writeAutosave(h: History<GameTypes>, name: string): Promise<unknown> };
  /** The autosave's name (default the seed). */
  readonly saveName?: (snap: { state: unknown; options: unknown }) => string;
}

export interface GameStore<G extends GameTypes, V> {
  readonly get: () => GameSnap<G, V>;
  readonly subscribe: (fn: () => void) => () => void;
  readonly fresh: (seed: string) => void;
  /** The player's answer; a stale `promptId` (not the open prompt) is dropped. False when dropped or refused. */
  readonly answer: (picks: readonly string[], promptId: number) => boolean;
  readonly undo: () => boolean;
  readonly redo: () => boolean;
  readonly canUndo: () => { readonly ok: true; readonly peek: boolean } | { readonly ok: false; readonly reason: string };
  /** saves' `restore` path: the reason when it does not load. Undo steps are rebuilt (an answer of the player's seat that `forced` would not give starts one). */
  readonly load: (save: SaveFile<G>) => string | null;
  /** engine-core `History` for saves (`saveNamed`, `SavesScreen`). */
  readonly saved: () => History<G>;
  readonly advance: () => void;
  readonly skip: () => void;
  /** The last autosave write (tests await it). */
  readonly autosaved: () => Promise<unknown>;
}

export function createGameStore<G extends GameTypes, V, S extends SeatId>(def: GameDef<G, V, S>, o: StoreOptions<S>): GameStore<G, V> {
  const me = (): S => (typeof o.seat === 'function' ? (o.seat)() : o.seat);
  const forced: Forced<G['prompt']> = def.forced ?? (() => null);
  const isStep = def.isStep ?? (() => true);
  const subs = new Set<() => void>();
  let pending: Promise<unknown> = Promise.resolve();
  let snap: GameSnap<G, V>;

  // the opponent's prompts and the player's forced ones, each joined to the top step, until the player must answer
  function settle(h: StepHistory<G>, evs: readonly G['event'][]): { h: StepHistory<G>; evs: G['event'][]; error: string | null } {
    const out = [...evs];
    for (let i = 0; i < 1000; i += 1) {
      const p = h.state.prompt as G['prompt'] | null;
      if (p === null) break;
      const theirs = p.seat !== undefined && seatKey(p.seat) !== seatKey(me());
      if (theirs && def.opponent !== undefined) {
        const r = extendStep(def.rules, h, answerOf(p.id, def.opponent(def.view(h.state, p.seat as S), p)), def.content);
        if (!r.ok) return { h, evs: out, error: r.error };
        h = r.history;
        out.push(...r.events);
        continue;
      }
      const f = sendForced(def.rules, h, def.content, forced, { seat: me() });
      if (f.capped) return { h: f.history, evs: [...out, ...f.events], error: f.error };
      if (f.history === h) return { h, evs: out, error: null };
      h = f.history;
      out.push(...f.events);
    }
    return { h, evs: out, error: h.state.prompt === null ? null : 'The opponent and forced answers did not stop after 1000 rounds.' };
  }

  const set = (next: GameSnap<G, V>): void => {
    snap = next;
    for (const fn of subs) fn();
  };
  const make = (h: StepHistory<G>, steps: Steps<V, G['event']>, options: G['options'], rules: G['rules'], error: string | null): GameSnap<G, V> => ({
    history: h, state: h.state, view: def.view(h.state, me()), steps, options, rules, error,
  });
  const saved = (): History<G> => ({ options: snap.options, rules: snap.rules, actions: snap.history.actions, cursor: snap.history.actions.length, undoUsed: snap.history.undoUsed });
  const autosave = (): void => {
    if (o.saves === undefined) return;
    pending = o.saves.writeAutosave(saved(), o.saveName?.(snap) ?? String((snap.options as { seed?: string }).seed ?? ''));
  };
  function fresh(seed: string): void {
    const { options, rules } = def.start(seed);
    const s = settle(newSteps<G>(createGame(def.rules, options, rules, def.content).state), []);
    set(make(s.h, noSteps(), options, rules, s.error));
  }
  const mode = (): UndoMode => (typeof o.undo === 'function' ? o.undo() : (o.undo ?? 'safe'));
  const undoOpts = o.afterGameOver === undefined ? {} : { afterGameOver: o.afterGameOver };

  fresh(o.seed ?? 'start');
  return {
    get: () => snap,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    fresh,
    answer(picks, promptId) {
      const p = snap.state.prompt;
      if (p === null || p.id !== promptId) return false;
      const r = answerWithForced(def.rules, snap.history, answerOf(promptId, picks), def.content, forced, { seat: me() });
      if (!r.ok) {
        set({ ...snap, error: r.error });
        return false;
      }
      const s = r.capped ? { h: r.history, evs: [...r.events], error: r.error } : settle(r.history, r.events);
      set(make(s.h, pushSteps(snap.steps, snap.view, s.evs, isStep, o.instant?.() ?? false), snap.options, snap.rules, s.error));
      autosave();
      return true;
    },
    undo() {
      const r = undoStep(def.rules, snap.history, mode(), def.content, undoOpts);
      set(r.ok ? make(r.history, noSteps(), snap.options, snap.rules, null) : { ...snap, error: r.error });
      if (r.ok) autosave();
      return r.ok;
    },
    redo() {
      const r = redoStep(def.rules, snap.history, def.content);
      set(r.ok ? make(r.history, noSteps(), snap.options, snap.rules, null) : { ...snap, error: r.error });
      if (r.ok) autosave();
      return r.ok;
    },
    canUndo: () => canUndoStep(snap.history, mode(), undoOpts),
    load(save) {
      const back = restoreSave(def.rules, save, def.content, def.format);
      if (!back.ok) return back.error;
      const m = back.save;
      const r = replaySteps(def.rules, m.options, m.rules, m.actions, def.content, (state, a) => {
        const p = state.prompt as G['prompt'] | null;
        return a.kind === 'answer' && p !== null && (p.seat === undefined || seatKey(p.seat) === seatKey(me())) && forced(p) === null;
      });
      if (!r.ok) return r.error;
      const s = settle({ ...r.history, undoUsed: m.undoUsed }, []);
      set(make(s.h, noSteps(), m.options, m.rules, s.error));
      return null;
    },
    saved,
    advance: () => set({ ...snap, steps: advance(snap.steps) }),
    skip: () => set({ ...snap, steps: skip(snap.steps) }),
    autosaved: () => pending,
  };
}
