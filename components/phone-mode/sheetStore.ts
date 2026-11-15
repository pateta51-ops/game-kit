// A store for the one bottom sheet open at a time, over the game's own sheet machine (its states and events): opening
// one replaces the other, so no lone booleans. The data (a card, an entry) stays while `keeps(state)` says so.
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { can, transition, type Machine } from '../state-machines/machine';

export interface SheetStore<S extends string, E extends string, D> {
  readonly state: S;
  readonly data: D | null;
  send(event: E, data?: D): void;
  /** Sends `event` only when the table allows it from the current state (a version change with nothing open). */
  sendIfCan(event: E): void;
}

export function createSheetStore<S extends string, E extends string, D = unknown>(
  machine: Machine<S, E>,
  keeps: (state: S) => boolean = (s) => s !== machine.initial,
): UseBoundStore<StoreApi<SheetStore<S, E, D>>> {
  return create<SheetStore<S, E, D>>((set, get) => ({
    state: machine.initial,
    data: null,
    send(event, data) {
      const state = transition(machine, get().state, event);
      set({ state, data: keeps(state) ? (data ?? get().data) : null });
    },
    sendIfCan(event) {
      if (can(machine, get().state, event)) get().send(event);
    },
  }));
}
