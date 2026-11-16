// BUILD_PLAN §4.4, §4.9: a stable fingerprint of any plain-JSON value (ported from Warp's Edge). Saves store the state's hash,
// a replay recomputes it, and a mismatch means the engine changed under the save. Same value, same hash, on any machine:
// canonical JSON with sorted keys, then FNV-1a 64-bit (synchronous, no crypto API). `hashState(state: GameState)` of the
// public API (§4.4) is this function on the state; it arrives with the contract (Phase 1a).
import { canonicalJson, fnv1a64 } from './canonical.ts';

export function hashValue(value: unknown): string {
  return fnv1a64(canonicalJson(value));
}
