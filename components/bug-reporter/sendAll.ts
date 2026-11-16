// Bug reports: "Send all bug reports": every queued report, one at a time (fileAll.ts), with the progress
// and the last run's summary shared by Settings and Home.
import { create } from 'zustand';
import { fileAll, type FileDeps, type SendAllSummary } from './fileAll.ts';
import { useQueue } from './queue.ts';
import { sendDeps } from './transport.ts';

export const useSendAll = create<{ summary: SendAllSummary | null; progress: string | null }>(() => ({
  summary: null,
  progress: null,
}));

export async function sendAllQueued(deps: FileDeps = sendDeps()): Promise<SendAllSummary> {
  const batch = [...useQueue.getState().items];
  useSendAll.setState({ summary: null, progress: `Sending 0 of ${String(batch.length)}…` });
  try {
    const summary = await fileAll(batch, deps, (done, total) => {
      useSendAll.setState({ progress: `Sending ${String(done)} of ${String(total)}…` });
    });
    useSendAll.setState({ summary, progress: null });
    return summary;
  } catch {
    const summary: SendAllSummary = { sent: 0, failed: batch.length, skipped: 0, results: [] };
    useSendAll.setState({ summary, progress: null });
    return summary;
  }
}
