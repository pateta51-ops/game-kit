// The earn toast as data: several earns of one game become one counted toast; none on the first run, none when off.
import type { AchievementDef } from './achievements.ts';

export interface Toast {
  /** Ids earned, in catalogue order. */
  ids: string[];
  /** How many (`ids.length`): the counted toast reads "3 achievements". */
  count: number;
  /** The first earn's name, shown when `count` is 1. */
  name: string;
  /** Milliseconds to hold it (a static toast has no motion). */
  holdMs: number;
}

export interface ToastOptions {
  /** The setting is off. */
  off?: boolean;
  /** First run on a history that already holds games: the backlog is not announced. */
  silent?: boolean;
  holdMs?: number;
}

export const DEFAULT_HOLD_MS = 5000;

/** What the newest game earned as one toast, or null (nothing earned, off, silent). `ids` come from `newlyEarned`. */
export function toastFor(defs: readonly AchievementDef[], ids: readonly string[], o: ToastOptions = {}): Toast | null {
  if (o.off || o.silent) return null;
  const got = defs.filter((d) => ids.includes(d.id));
  const first = got[0];
  return first ? { ids: got.map((d) => d.id), count: got.length, name: first.name, holdMs: o.holdMs ?? DEFAULT_HOLD_MS } : null;
}

/** True once: the first call with this storage and key writes a marker. Call it before showing earns and pass the answer as `silent`. */
export function firstRun(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string): boolean {
  if (storage.getItem(key) !== null) return false;
  storage.setItem(key, '1');
  return true;
}

/** A settings section (the `settings` component's Section shape): a toggle and a hold choice in seconds. `w` replaces the words. */
export const toastSettingsWith = (w: { title?: string; toggle?: string; hold?: string; seconds?: (n: number) => string } = {}) => {
  const sec = w.seconds ?? ((n: number) => `${n} s`);
  return {
    id: 'achievements',
    title: w.title ?? 'Achievements',
    settings: [
      { kind: 'toggle', key: 'achToast', default: true, label: w.toggle ?? 'Show a toast when an achievement is earned' },
      { kind: 'choice', key: 'achToastSeconds', default: 5, label: w.hold ?? 'Toast hold time', options: [3, 5, 8].map((n) => ({ value: n, label: sec(n) })) },
    ],
  } as const;
};
export const toastSettings = toastSettingsWith();

/** The progress text of a row: "3 / 5". */
export const progressText = (current: number, target: number): string => `${current} / ${target}`;
