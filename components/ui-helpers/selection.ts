// Lifted from jarl src/ui/prompts/pick.ts and pick.machine.ts: a multi-pick selection that belongs to one version of
// the game store and one prompt id, so it never survives an answer, undo, redo, load or a returning prompt id.
import { createStore, type StoreApi } from 'zustand/vanilla';

/** Where a pick belongs: the game store's version and the open prompt. */
export interface PickScope {
  version: number;
  promptId: number | string;
}

export type Selection<Id> =
  | { readonly status: 'empty' }
  | ({ readonly status: 'some' | 'full'; readonly picks: readonly Id[] } & Readonly<PickScope>);

export interface SelectionState<Id> {
  readonly selection: Selection<Id>;
  /** Adds or removes `id`; a new id is ignored when `max` are picked. A selection of another scope is dropped first. */
  toggle: (scope: PickScope & { max: number }, id: Id) => void;
  reset: () => void;
}

/** The picks of `sel` for this version and prompt (none for another version or prompt). */
export function picksFor<Id>(sel: Selection<Id>, scope: PickScope): readonly Id[] {
  return sel.status !== 'empty' && sel.version === scope.version && sel.promptId === scope.promptId ? sel.picks : [];
}

export function createSelection<Id>(): StoreApi<SelectionState<Id>> {
  return createStore<SelectionState<Id>>()((set, get) => ({
    selection: { status: 'empty' },
    toggle(scope, id) {
      const cur = picksFor(get().selection, scope);
      const has = cur.includes(id);
      if (!has && cur.length >= scope.max) return;
      const picks = has ? cur.filter((x) => x !== id) : [...cur, id];
      set({
        selection:
          picks.length === 0
            ? { status: 'empty' }
            : {
                status: picks.length >= scope.max ? 'full' : 'some',
                version: scope.version,
                promptId: scope.promptId,
                picks,
              },
      });
    },
    reset() {
      if (get().selection.status !== 'empty') set({ selection: { status: 'empty' } });
    },
  }));
}
