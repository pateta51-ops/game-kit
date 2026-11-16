import { useCallback, useRef, useState } from 'react';
import { can, transition, type Machine } from './machine.ts';

export interface Machined<S extends string, E extends string, D> {
  readonly state: S;
  /** The value sent with the last event; null in the initial state. */
  readonly data: D | null;
  /** No value (or undefined) keeps the last one; null clears it. */
  readonly send: (event: E, data?: D | null) => void;
}

/** The next state and value after `event` (pure). An illegal event throws (dev, test) or logs and returns `cur` (production). */
export function step<S extends string, E extends string, D>(
  m: Machine<S, E>,
  cur: { state: S; data: D | null },
  event: E,
  data?: D | null,
): { state: S; data: D | null } {
  if (!can(m, cur.state, event)) {
    transition(m, cur.state, event);
    return cur;
  }
  const state = transition(m, cur.state, event);
  return { state, data: state === m.initial ? null : data === undefined ? cur.data : data };
}

export function useMachine<S extends string, E extends string, D = never>(m: Machine<S, E>): Machined<S, E, D> {
  const [cur, setCur] = useState<{ state: S; data: D | null }>({ state: m.initial, data: null });
  const now = useRef(cur);
  const send = useCallback(
    (event: E, data?: D | null) => {
      now.current = step(m, now.current, event, data);
      setCur(now.current);
    },
    [m],
  );
  return { state: cur.state, data: cur.data, send };
}
