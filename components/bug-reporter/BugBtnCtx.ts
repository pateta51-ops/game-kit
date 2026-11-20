import { createContext, type ReactNode } from 'react';

export interface BugBtnProps {
  readonly label: ReactNode;
  readonly onClick: (() => void) | undefined;
  readonly disabled: boolean;
  /** Which button: send-all, report, download-all, send, download, delete, forget, save. */
  readonly kind: string;
  /** `bug-btn` (and `primary`) plus the settings' `buttonClass`. */
  readonly className: string;
  readonly type: 'button' | 'submit';
  readonly testId: string;
}
export interface BugBtnSlots {
  /** Added to the class of every `.bug-btn` in Settings > Bug reports. */
  readonly buttonClass?: string;
  /** Draws a button instead of the default `<button>`; wire `onClick`, `disabled`, `type` and `testId` through. */
  readonly renderButton?: (b: BugBtnProps) => ReactNode;
}
export const Slots = createContext<BugBtnSlots>({});
