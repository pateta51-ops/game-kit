// The ability-fired trace (K98): the game's ability registry wrapped in a Proxy records each id looked up
// (`considered`) and each id whose `field` (default `effects`) was read to run (`resolved`). `expectResolved` fails a
// card test whose card was never run, so a test cannot pass without the card it names.
export interface AbilityTrace<R> {
  readonly registry: R;
  readonly considered: Set<string>;
  readonly resolved: Set<string>;
  clear(): void;
}

export function traceAbilities<R extends Readonly<Record<string, object>>>(registry: R, field = 'effects'): AbilityTrace<R> {
  const considered = new Set<string>();
  const resolved = new Set<string>();
  // A copy as the target: a frozen registry would refuse a wrapped value (Proxy invariant).
  const proxy = new Proxy({ ...registry }, {
    get(t, k, r) {
      const v: unknown = Reflect.get(t, k, r);
      if (typeof k !== 'string' || !Object.hasOwn(t, k) || typeof v !== 'object' || v === null) return v;
      considered.add(k);
      return new Proxy(v, {
        get(a, f, ar) {
          if (f === field) resolved.add(k);
          return Reflect.get(a, f, ar) as unknown;
        },
      });
    },
  });
  return {
    registry: proxy,
    considered,
    resolved,
    clear() {
      considered.clear();
      resolved.clear();
    },
  };
}

/** Throws unless every id in `ids` was resolved; says whether it was only looked up or never reached. */
export function expectResolved(trace: AbilityTrace<unknown>, ...ids: string[]): void {
  const bad = ids.filter((id) => !trace.resolved.has(id));
  if (bad.length > 0)
    throw new Error(`Not resolved: ${bad.map((id) => `${id} (${trace.considered.has(id) ? 'looked up, not run' : 'never looked up'})`).join(', ')}`);
}
