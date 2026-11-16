// K123 (UFS src/ui/prompts/confirm.tsx useTapConfirm, simple.tsx): a prompt answered on the board. The board draws each
// option's mark and calls `tap(id)`; the first tap on a legal target arms it (a preview), a second tap, Confirm or Enter
// answers, Cancel or Escape disarms. A target that stops being legal disarms. K226: max > 1 picks several (a tap toggles,
// Confirm or Enter answers once min..max are picked; `confirm: false` answers when max are picked).
import { useEffect, useState } from 'react';
import type { KernelPrompt } from '../engine-core/index.ts';
import type { Answer } from './host.tsx';

export type Mark = 'legal' | 'barred' | 'armed';

export interface BoardPick {
  /** Option id to its mark: what the board highlights. */
  readonly marks: Readonly<Record<string, Mark>>;
  /** One pick: the armed option. Several: the last picked. */
  readonly armed: string | null;
  /** K226: the armed or picked options, in tap order. */
  readonly picks: readonly string[];
  /** K226: Confirm would answer now. */
  readonly ready: boolean;
  readonly tap: (id: string) => void;
  readonly confirm: () => void;
  readonly cancel: () => void;
}

/** `confirm: false` answers on the first tap (a mouse with hover previews needs no second tap). */
export function useBoardPick(prompt: KernelPrompt | null, answer: Answer, { confirm: ask = true }: { confirm?: boolean } = {}): BoardPick {
  const [at, setAt] = useState<{ prompt: number; ids: readonly string[] } | null>(null);
  const legal = (id: string): boolean => prompt?.options.some((o) => o.id === id && o.enabled) === true;
  const max = prompt?.max ?? 1;
  const picks = at !== null && at.prompt === prompt?.id ? at.ids.filter(legal) : [];
  const armed = picks.at(-1) ?? null;
  const ready = prompt !== null && picks.length >= Math.max(prompt.min, 1) && picks.length <= max;
  const send = (ids: readonly string[]): void => {
    setAt(null);
    if (prompt !== null) answer(ids, prompt.id);
  };
  const marks: Record<string, Mark> = {};
  for (const o of prompt?.options ?? []) marks[o.id] = picks.includes(o.id) ? 'armed' : o.enabled ? 'legal' : 'barred';
  const pick: BoardPick = {
    marks,
    armed,
    picks,
    ready,
    tap: (id) => {
      if (!legal(id) || prompt === null) return;
      if (max <= 1) {
        if (!ask || id === armed) send([id]);
        else setAt({ prompt: prompt.id, ids: [id] });
        return;
      }
      const next = picks.includes(id) ? picks.filter((x) => x !== id) : picks.length < max ? [...picks, id] : picks;
      if (!ask && next.length === max) send(next);
      else setAt({ prompt: prompt.id, ids: next });
    },
    confirm: () => {
      if (ready) send(picks);
    },
    cancel: () => setAt(null),
  };
  useEffect(() => {
    if (armed === null) return;
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') pick.confirm();
      else if (e.key === 'Escape') pick.cancel();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  return pick;
}
