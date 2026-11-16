import { useState } from 'react';
import { dockState, dockToggle, type DockChoice } from './dock.ts';

/** `[open, toggle]`: open as the decision wants, or as the player chose while `key` (dockKey) stays the same. */
export function useDock(wants: boolean, key: string): [boolean, () => void] {
  const [choice, setChoice] = useState<DockChoice | null>(null);
  return [dockState(wants, key, choice) === 'open', () => setChoice(dockToggle(wants, key, choice))];
}
