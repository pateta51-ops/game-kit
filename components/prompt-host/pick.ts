// K123 (UFS src/ui/prompts/confirm.tsx useTapConfirm, simple.tsx): a prompt answered on the board. The board draws each
// option's mark and calls `tap(id)`; the first tap on a legal target arms it (a preview), a second tap, Confirm or Enter
// answers, Cancel or Escape disarms. A target that stops being legal disarms. One pick (min = max = 1).
import { useEffect, useState } from 'react';
import type { KernelPrompt } from '../engine-core/index';
import type { Answer } from './host';

export type Mark = 'legal' | 'barred' | 'armed';

export interface BoardPick {
  /** Option id to its mark: what the board highlights. */
  readonly marks: Readonly<Record<string, Mark>>;
  readonly armed: string | null;
  readonly tap: (id: string) => void;
  readonly confirm: () => void;
  readonly cancel: () => void;
}

/** `confirm: false` answers on the first tap (a mouse with hover previews needs no second tap). */
export function useBoardPick(prompt: KernelPrompt | null, answer: Answer, { confirm: ask = true }: { confirm?: boolean } = {}): BoardPick {
  const [armedAt, setArmed] = useState<{ prompt: number; id: string } | null>(null);
  const legal = (id: string): boolean => prompt?.options.some((o) => o.id === id && o.enabled) === true;
  const armed = armedAt !== null && armedAt.prompt === prompt?.id && legal(armedAt.id) ? armedAt.id : null;
  const send = (id: string): void => {
    setArmed(null);
    if (prompt !== null) answer([id], prompt.id);
  };
  const marks: Record<string, Mark> = {};
  for (const o of prompt?.options ?? []) marks[o.id] = o.id === armed ? 'armed' : o.enabled ? 'legal' : 'barred';
  const pick: BoardPick = {
    marks,
    armed,
    tap: (id) => {
      if (!legal(id)) return;
      if (!ask || id === armed) send(id);
      else if (prompt !== null) setArmed({ prompt: prompt.id, id });
    },
    confirm: () => {
      if (armed !== null) send(armed);
    },
    cancel: () => setArmed(null),
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
