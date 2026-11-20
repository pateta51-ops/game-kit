// Issue 45: a small button, always on screen, that opens the bug report (what F8 does on a keyboard). The Settings choice
// "Bug report button" is auto (on for phone-sized screens), on or off. It is marked data-no-capture, so it is never in its own
// screenshot, and it hides while the dialog is open.
import { useSyncExternalStore } from 'react';
import { bugConfig } from './config.ts';
import { openBugReport, useBugDialog } from './dialogStore.ts';
import { Btn } from './BugBtn.tsx';
import { Slots, type BugBtnSlots } from './BugBtnCtx.ts';
import './bugs.css';

// a phone, upright or sideways: a narrow screen, or a short touch screen
const PHONE_QUERY = '(max-width: 600px), (pointer: coarse) and (max-height: 600px)';

const hasMedia = (): boolean => typeof window.matchMedia === 'function';

function subscribe(onChange: () => void): () => void {
  if (!hasMedia()) return () => undefined;
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', onChange);
  return () => {
    mq.removeEventListener('change', onChange);
  };
}

/** Whether the screen is phone-sized. */
function usePhoneSized(): boolean {
  return useSyncExternalStore(subscribe, () => hasMedia() && window.matchMedia(PHONE_QUERY).matches);
}

export function FloatingBugButton(slots: BugBtnSlots = {}) {
  const mode = (bugConfig().useButtonMode ?? (() => 'auto' as const))();
  const phone = usePhoneSized();
  // the table's header has its own bug button (top right, by the gear)
  const onTable = (bugConfig().useHideFloatingButton ?? (() => false))();
  const phase = useBugDialog((s) => s.dialog.phase);
  if (onTable || phase !== 'closed' || mode === 'off' || (mode === 'auto' && !phone)) return null;
  return (
    <Slots.Provider value={slots}>
      <Btn
        kind="float"
        base="bug-float"
        testId="bug-float"
        noCapture
        ariaLabel="Report a bug"
        title="Report a bug (F8)"
        onClick={openBugReport}
        label={
  <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 4.5a3.5 3.5 0 0 1 3.4 2.7A6 6 0 0 1 18 11.5V12h3v2h-3v1a6 6 0 0 1-.3 1.8l2.6 1.5-1 1.7-2.5-1.4A6 6 0 0 1 12 21a6 6 0 0 1-4.8-2.4l-2.5 1.4-1-1.7 2.6-1.5A6 6 0 0 1 6 15v-1H3v-2h3v-.5a6 6 0 0 1 2.6-4.3A3.5 3.5 0 0 1 12 4.5zM11 11v8.9a4 4 0 0 0 2 0V11z"
          />
        </svg>
        }
      />
    </Slots.Provider>
  );
}
