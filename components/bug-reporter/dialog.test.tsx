// Bug reports: Settings > Bug reports lists the queue with its count; "Send all bug reports" files them and shows the summary
// (sent N, failed M with each reason); the failed one stays listed. The dialog keeps a report in the queue first.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestGame } from './test-utils.ts';
import { BugReportHost } from './BugReportDialog.tsx';
import { BugSettings, QueueBar } from './BugSettings.tsx';
import { collectReport } from './collect.ts';
import { useBugDialog } from './dialogStore.ts';
import {
  MEMORY_ONLY_NOTE,
  queueReport,
  safeInQueueMessage,
  savedMessage,
  unqueueReport,
  useQueue,
} from './queue.ts';
import { useSendAll } from './sendAll.ts';
import { useToken } from './token.ts';
import { installDevBugHooks } from './transport.ts';

const SHOT = 'iVBORw0KGgo'.repeat(30);

vi.mock('./capture.ts', () => ({
  captureScreen: () => Promise.resolve('iVBORw0KGgo'.repeat(30)),
  compressScreenshot: (png: string) => Promise.resolve({ ext: 'png', base64: png }),
}));

beforeEach(async () => {
  window.localStorage.clear();
  useToken.getState().forget();
  useSendAll.setState({ summary: null, progress: null });
  await useQueue.getState().refresh();
  for (const q of useQueue.getState().items) await unqueueReport(q.report.id);
  startTestGame();
});
afterEach(() => {
  cleanup();
  (window as unknown as { bugReports?: { real: () => void } }).bugReports?.real();
});

describe('bug reports: Settings and Send all', () => {
  it('lists three queued reports and Send all shows sent 2, failed 1 with the reason; the failed one stays', async () => {
    for (const text of ['Card art missing', 'Undo greyed out [fail]', 'Score sheet overlaps'])
      await queueReport(collectReport(text, SHOT), null);
    installDevBugHooks();
    (window as unknown as { bugReports: { simulate: () => void } }).bugReports.simulate();
    render(<BugSettings />);
    await waitFor(() => {
      expect(screen.getAllByTestId('bug-queue-item')).toHaveLength(3);
    });
    expect(screen.getByTestId('bug-queue-count').textContent).toBe('3 bug reports queued');
    fireEvent.click(screen.getByTestId('bug-send-all'));
    const summary = await screen.findByTestId('bug-send-summary');
    expect(summary.textContent).toContain('Sent 2, failed 1');
    expect(screen.getByTestId('bug-summary-failed').textContent).toContain('Undo greyed out [fail]');
    expect(screen.getByTestId('bug-summary-failed').textContent).toContain('502: Server Error');
    await waitFor(() => {
      expect(screen.getAllByTestId('bug-queue-item')).toHaveLength(1);
    });
    expect(screen.getByTestId('bug-queue-error').textContent).toContain('502');
  });

  it('without a token Send all files nothing and says to paste one', async () => {
    await queueReport(collectReport('One', SHOT), null);
    await queueReport(collectReport('Two', SHOT), null);
    render(<QueueBar />);
    await waitFor(() => {
      expect(screen.getByTestId('bug-queue-count').textContent).toBe('2 bug reports queued');
    });
    fireEvent.click(screen.getByTestId('bug-send-all'));
    const summary = await screen.findByTestId('bug-send-summary');
    expect(summary.textContent).toContain('Sent 0, failed 2');
    expect(summary.textContent).toContain('No GitHub token yet');
    expect(useQueue.getState().items).toHaveLength(2);
  });

  it('the dialog keeps the report in the queue first, so Send now without a token loses nothing', async () => {
    render(<BugReportHost />);
    await act(async () => {
      await useBugDialog.getState().open();
    });
    fireEvent.change(screen.getByTestId('bug-explanation'), { target: { value: 'The Edict did not score' } });
    fireEvent.click(screen.getByTestId('bug-send'));
    const result = await screen.findByTestId('bug-result');
    await waitFor(() => {
      expect(result.textContent).toContain(
        useQueue.getState().memoryOnly ? 'only until this page closes' : 'safe in the queue',
      );
    });
    expect(useQueue.getState().items.map((i) => i.report.explanation)).toEqual(['The Edict did not score']);
    expect(useQueue.getState().items[0]?.report.screenshot?.base64).toBe(SHOT);
  });
  it('says plainly when the queue is memory-only (private window), and not otherwise', () => {
    expect(savedMessage(false)).toBe('Saved in the queue (Settings > Bug reports > Send all).');
    expect(savedMessage(true)).not.toContain('Saved in the queue');
    expect(savedMessage(true)).toContain('only until this page closes');
    expect(savedMessage(true)).toContain('Download');
    expect(safeInQueueMessage(false)).toContain('safe in the queue');
    expect(safeInQueueMessage(true)).not.toContain('safe in the queue');
    expect(safeInQueueMessage(true)).toContain(MEMORY_ONLY_NOTE);
  });

  it('Keep in queue and Settings show the memory-only note when IndexedDB refuses', async () => {
    render(<BugReportHost />);
    await act(async () => {
      await useBugDialog.getState().open();
    });
    fireEvent.click(screen.getByTestId('bug-queue'));
    const result = await screen.findByTestId('bug-result');
    await waitFor(() => {
      expect(result.textContent).not.toBe('Saving in the queue…');
    });
    const memoryOnly = useQueue.getState().memoryOnly;
    expect(result.textContent).toBe(savedMessage(memoryOnly));
    cleanup();
    render(<BugSettings />);
    await waitFor(() => {
      expect(screen.queryByTestId('bug-memory-only') !== null).toBe(memoryOnly);
    });
  });
});
