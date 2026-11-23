// K708: a clause trace from verb dispatch. card-harness `traceAbilities` counts any read of a record's `effects` as a
// resolve, so a dry-run offer check or a passive scan counts too. `dispatchTrace(registry, probe)` keeps its `registry`
// and `considered`, but `resolved` holds only the ids the game's verb dispatch noted (`{ kind: 'clause', id }`) on the
// probe when it ran a clause outside dry run. Fits `SimGame.trace`, `expectResolved` and `proveResolved`.
import { traceAbilities, type AbilityTrace } from '../card-harness/trace.ts';

export interface DispatchNotes {
  listen(fn: (n: { readonly kind: string; readonly id: string }) => void): () => void;
}

export function dispatchTrace<R extends Readonly<Record<string, object>>>(registry: R, probe: DispatchNotes, kind = 'clause'): AbilityTrace<R> & { stop(): void } {
  const t = traceAbilities(registry);
  const resolved = new Set<string>();
  const stop = probe.listen((n) => void (n.kind === kind && resolved.add(n.id)));
  return {
    registry: t.registry,
    considered: t.considered,
    resolved,
    clear() {
      t.clear();
      resolved.clear();
    },
    stop,
  };
}
