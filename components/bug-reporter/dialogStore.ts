// whether the bug-report dialog is open. Opening takes the screenshot first, so the dialog is not in it. Machine
// ui.bugDialog (dialog.machine.ts): one value, each phase with its data; a capture that lands after a close is dropped.
import { create } from 'zustand';
import { transition } from '../state-machines/machine.ts';
import { captureScreen } from './capture.ts';
import { BUG_DIALOG_MACHINE } from './dialog.machine.ts';

export type BugDialog =
  | { readonly phase: 'closed' }
  | { readonly phase: 'capturing'; readonly ticket: number }
  | { readonly phase: 'open'; readonly screenshot: string | null };

interface DialogState {
  dialog: BugDialog;
  open: () => Promise<void>;
  close: () => void;
}

let tickets = 0;

/** Take the screenshot, then open the dialog. The caller closes whatever menu is open before. */
export const useBugDialog = create<DialogState>((set, get) => ({
  dialog: { phase: 'closed' },
  open: async () => {
    const cur = get().dialog;
    if (cur.phase !== 'closed') return; // F8 twice
    transition(BUG_DIALOG_MACHINE, cur.phase, 'open');
    const ticket = (tickets += 1);
    set({ dialog: { phase: 'capturing', ticket } });
    // let the menu that was open draw closed before the screenshot
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    const screenshot = await captureScreen();
    const now = get().dialog;
    // closed while the screenshot was taken (or opened again since): this capture is stale
    if (now.phase !== 'capturing' || now.ticket !== ticket) return;
    transition(BUG_DIALOG_MACHINE, now.phase, 'captured');
    set({ dialog: { phase: 'open', screenshot } });
  },
  close: () => {
    const cur = get().dialog;
    if (cur.phase === 'closed') return;
    transition(BUG_DIALOG_MACHINE, cur.phase, 'close');
    set({ dialog: { phase: 'closed' } });
  },
}));

/** The menu entry. */
export function openBugReport(): void {
  void useBugDialog.getState().open();
}
