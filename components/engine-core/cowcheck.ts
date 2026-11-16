// The differential copy-on-write check of cow.property.test.ts as a helper (ported from Warp's Edge
// tests/property/cow.paths.test.ts), so a game drives the write paths its random play does not reach through it.
// One action is applied three ways to the same state: copy on write with freezing on, copy on write with freezing off (on
// an unfrozen copy, where a missed barrier would not throw) and the full copy. The input must not change and the three
// results (state JSON with keys in order, and events) must be equal. Test code: it switches the engine's modes and puts
// them back. Turn `setCowChecks(true)` on around it to also catch a barrier on a shared parent.
import { applyAction } from './apply.ts';
import { isFreezing, setStateFreezing } from './copy.ts';
import { copyMode, setCopyMode } from './cow.ts';
import type { GameRules, GameTypes } from './types.ts';

export interface DifferentialResult<G extends GameTypes> {
  /** The state after the action (copy on write, frozen); null when that run threw. */
  readonly state: G['state'] | null;
  readonly events: readonly G['event'][];
  /** Empty when copy on write behaves. */
  readonly problems: readonly string[];
}

export function differentialApply<G extends GameTypes>(
  game: GameRules<G>,
  state: G['state'],
  action: G['action'],
  content: G['content'],
): DifferentialResult<G> {
  const wasFreezing = isFreezing();
  const wasMode = copyMode();
  const before = JSON.stringify(state);
  const problems: string[] = [];
  const out: (string | null)[] = [];
  let kept: { state: G['state']; events: readonly G['event'][] } | null = null;
  try {
    for (const [name, freeze, mode] of [
      ['frozen', true, 'cow'],
      ['unfrozen', false, 'cow'],
      ['full copy', true, 'full'],
    ] as const) {
      setStateFreezing(freeze);
      setCopyMode(mode);
      const input = freeze ? state : structuredClone(state);
      try {
        const r = applyAction(game, input, action, content);
        out.push(JSON.stringify([r.state, r.events]));
        if (name === 'frozen') kept = r;
      } catch (e) {
        out.push(null);
        problems.push(`${name}: threw ${String(e)}`);
      }
      if (JSON.stringify(input) !== before) problems.push(`${name}: the input state changed`);
    }
  } finally {
    setStateFreezing(wasFreezing);
    setCopyMode(wasMode);
  }
  if (out[0] != null && out[1] != null && out[0] !== out[1]) problems.push('freezing off differs from freezing on');
  if (out[0] != null && out[2] != null && out[0] !== out[2]) problems.push('copy on write differs from the full copy');
  return { state: kept?.state ?? null, events: kept?.events ?? [], problems };
}
