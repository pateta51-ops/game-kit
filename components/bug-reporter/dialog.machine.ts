// The bug-report dialog's machines (inventory M10). Map: docs/architecture/STATE_MACHINES.md (npm run machines:doc after
// editing these tables; npm run machines -- ui.bugDialog).
import { can, defineMachine, transition } from '../state-machines/machine';

const SOURCE = 'components/bug-reporter/dialog.machine.ts';

// ui.bugDialog: useBugDialog.dialog (dialogStore.ts)
export type BugDialogPhase = 'closed' | 'capturing' | 'open';
export type BugDialogEvent = 'open' | 'captured' | 'close';

export const BUG_DIALOG_MACHINE = defineMachine<BugDialogPhase, BugDialogEvent>({
  id: 'ui.bugDialog',
  initial: 'closed',
  states: {
    closed: { on: { open: 'capturing' } },
    // the screenshot is taken before the dialog draws, so the dialog is not in it
    capturing: { on: { captured: 'open', close: 'closed' } },
    open: { on: { close: 'closed' } },
  },
  describe: {
    purpose:
      'Whether the bug-report dialog is shown (§9.10): F8 or the menu takes the screenshot, then the dialog opens.',
    source: SOURCE,
    stateLivesIn:
      'useBugDialog.dialog (src/ui/bugs/dialogStore.ts): { phase, ticket } while capturing, { phase, screenshot } when open',
    rules: ['§9.10'],
    notes: [
      'A capture that finishes after a close (or after a newer open) belongs to an old ticket and is dropped: the dialog never reopens by itself.',
      'open while capturing or open is ignored (F8 twice).',
    ],
  },
});

// ui.bugReport: the outcome line of the dialog (BugReportDialog.tsx)
export type BugReportState = 'none' | 'busy' | 'queued' | 'filed' | 'exported' | 'failed';
export type BugReportEvent =
  'queue' | 'file' | 'queued' | 'filed' | 'failed' | 'exported' | 'exportFailed' | 'drawFailed';

const AFTER_EXPORT = { exported: 'exported', exportFailed: 'failed' } as const;
const EDITABLE = { queue: 'busy', file: 'busy', ...AFTER_EXPORT, drawFailed: 'failed' } as const;

export const BUG_REPORT_MACHINE = defineMachine<BugReportState, BugReportEvent>({
  id: 'ui.bugReport',
  initial: 'none',
  states: {
    none: { on: EDITABLE },
    // Cancel, Escape and the other buttons wait; every way out of busy is an edge, so it cannot stick
    busy: { on: { queued: 'queued', filed: 'filed', failed: 'failed' } },
    // done: the report is kept (or filed); Download and Copy stay available
    queued: { on: AFTER_EXPORT },
    filed: { on: AFTER_EXPORT },
    exported: { on: EDITABLE },
    // failed: Save in the queue (and File on GitHub) try again
    failed: { on: EDITABLE },
  },
  describe: {
    purpose:
      'What the bug-report dialog has done with the report: nothing yet, working, kept in the queue, filed on GitHub, downloaded or copied, or failed (with the reason and a retry).',
    source: SOURCE,
    stateLivesIn:
      'Dialog outcome (src/ui/bugs/BugReportDialog.tsx useState), each variant with its message or issue link',
    rules: ['§9.10'],
    notes: [
      'queue: "Save in the queue"; file: "File on GitHub" (no token: queued; filing fails: the report goes to the queue and the outcome is failed). failed from busy also covers a queue write that rejects: the button is enabled again to retry.',
      'Left as it was (architect): Download or Copy after queued or filed moves to exported, which enables the other buttons again and replaces the issue link line.',
      'exported/exportFailed: Download file or Copy to clipboard. drawFailed: the marked screenshot could not be drawn (ui.bugMarkup rendering -> editing).',
    ],
  },
});

/** The outcome line of the dialog: a ui.bugReport state with its message or issue. */
export type Outcome =
  | { kind: 'none' }
  | { kind: 'busy' }
  | { kind: 'filed'; url: string; number: number }
  | { kind: 'queued'; message: string }
  | { kind: 'exported'; message: string }
  | { kind: 'failed'; message: string };

/** ui.bugReport: the outcome after `event` (dialog.machine.ts), with the message or the issue of the new state. */
export function after(
  cur: Outcome,
  event: BugReportEvent,
  d: { message?: string; url?: string; number?: number } = {},
): Outcome {
  // illegal: throws in dev/test; in production it logs and the outcome stays as it was, message and all
  if (!can(BUG_REPORT_MACHINE, cur.kind, event)) {
    transition(BUG_REPORT_MACHINE, cur.kind, event);
    return cur;
  }
  const kind = transition(BUG_REPORT_MACHINE, cur.kind, event);
  if (kind === 'none' || kind === 'busy') return { kind };
  if (kind === 'filed') return { kind, url: d.url ?? '', number: d.number ?? 0 };
  return { kind, message: d.message ?? '' };
}

// ui.bugMarkup: the screenshot markup editor inside the dialog
export type BugMarkupState = 'viewing' | 'enlarged' | 'editing' | 'rendering';
export type BugMarkupEvent = 'edit' | 'finish' | 'drawn' | 'drawFailed' | 'enlarge' | 'shrink';

export const BUG_MARKUP_MACHINE = defineMachine<BugMarkupState, BugMarkupEvent>({
  id: 'ui.bugMarkup',
  initial: 'viewing',
  states: {
    viewing: { on: { edit: 'editing', enlarge: 'enlarged' } },
    // the phone (mock M13 caption): a tap on the screenshot shows it full size; ✕, a tap on it or Esc returns
    enlarged: { on: { shrink: 'viewing' } },
    editing: { on: { finish: 'rendering' } },
    rendering: { on: { drawn: 'viewing', drawFailed: 'editing' } },
  },
  describe: {
    purpose:
      'The screenshot in the dialog: shown in the dialog, shown full size (the phone), the markup editor open, then the marks drawn into the image.',
    source: SOURCE,
    stateLivesIn: 'Dialog markup (src/ui/bugs/BugReportDialog.tsx useState)',
    rules: ['§9.10'],
    notes: [
      'While editing or rendering, Escape does not close the dialog; while rendering the buttons wait (with ui.bugReport busy).',
      'enlarge: a tap on the phone dialog’s screenshot; shrink: ✕, a tap on the full-size picture, or Escape (which then leaves the dialog open).',
    ],
  },
});
