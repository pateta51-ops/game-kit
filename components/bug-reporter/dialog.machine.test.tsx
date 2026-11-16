// Inventory M10 (B-c): the bug-report dialog's machines (dialog.machine.ts). The dialog does not reopen when it is closed
// while the screenshot is taken; a queue write that rejects ends in failed with a retry, never a stuck "busy".
import 'fake-indexeddb/auto';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { edgesOf, setMachineMode, transition } from '../state-machines/machine.ts';
import { expectIllegal } from '../state-machines/test-utils.ts';
import { after, BUG_DIALOG_MACHINE, BUG_MARKUP_MACHINE, BUG_REPORT_MACHINE } from './dialog.machine.ts';
import { useBugDialog } from './dialogStore.ts';
import { unqueueReport, useQueue } from './queue.ts';

// The next screenshot, settled by release() whether the store has called captureScreen yet or not: the store waits two
// animation frames before it captures, and under load (CI, the full run) those frames can land after the test's own
// wait, so a resolver captured inside captureScreen would still be the previous test's and the capture would never end.
let shot: { promise: Promise<string | null>; resolve: (s: string | null) => void };
const freshShot = () => {
  let resolve: (s: string | null) => void = () => undefined;
  const promise = new Promise<string | null>((r) => {
    resolve = r;
  });
  shot = { promise, resolve };
};
freshShot();
const release = (s: string | null) => {
  shot.resolve(s);
};
vi.mock('./capture.ts', () => ({
  captureScreen: () => shot.promise,
}));

const phase = () => useBugDialog.getState().dialog.phase;
const frames = () => new Promise((r) => setTimeout(r, 40)); // the two animation frames before the capture

beforeEach(async () => {
  freshShot();
  await useQueue.getState().refresh();
  for (const q of useQueue.getState().items) await unqueueReport(q.report.id);
});

afterEach(() => {
  act(() => {
    useBugDialog.getState().close();
  });
});

describe('ui.bugDialog (dialogStore.ts)', () => {
  it('open -> capturing -> captured -> open -> close -> closed', async () => {
    const opened = useBugDialog.getState().open();
    expect(phase()).toBe('capturing');
    await frames();
    release(null);
    await opened;
    expect(phase()).toBe('open');
    useBugDialog.getState().close();
    expect(phase()).toBe('closed');
  });

  it('B-c: closed while the screenshot is taken, the late capture does not reopen the dialog', async () => {
    const opened = useBugDialog.getState().open();
    expect(phase()).toBe('capturing');
    useBugDialog.getState().close();
    expect(phase()).toBe('closed');
    await frames();
    release('late-shot');
    await opened;
    expect(phase()).toBe('closed');
  });

  it('open while capturing is ignored (F8 twice); sample illegal edges throw with the table and the fix', async () => {
    const opened = useBugDialog.getState().open();
    await useBugDialog.getState().open();
    expect(phase()).toBe('capturing');
    await frames();
    release(null);
    await opened;
    expect(phase()).toBe('open');
    expectIllegal(
      () => transition(BUG_DIALOG_MACHINE, 'closed', 'captured'),
      BUG_DIALOG_MACHINE,
      'closed',
      'captured',
    );
    expectIllegal(() => transition(BUG_REPORT_MACHINE, 'busy', 'queue'), BUG_REPORT_MACHINE, 'busy', 'queue');
    expectIllegal(
      () => transition(BUG_MARKUP_MACHINE, 'viewing', 'finish'),
      BUG_MARKUP_MACHINE,
      'viewing',
      'finish',
    );
  });

  it('every way into busy has a way out (queued, filed, failed): busy cannot stick', () => {
    const out = edgesOf(BUG_REPORT_MACHINE)
      .filter((e) => e.from === 'busy')
      .map((e) => e.to);
    expect(out.sort()).toEqual(['failed', 'filed', 'queued']);
    for (const e of edgesOf(BUG_REPORT_MACHINE).filter((x) => x.to === 'busy'))
      expect(['queue', 'file']).toContain(e.event);
  });
});

describe('ui.bugReport in production (after() in dialog.machine.ts)', () => {
  it('an illegal event logs and keeps the outcome with its message', () => {
    setMachineMode('log');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const cur = { kind: 'queued', message: 'Saved in the queue (Settings > Bug reports).' } as const;
      expect(after(cur, 'queue', { message: 'other' })).toBe(cur);
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
      setMachineMode('auto');
    }
  });
});
