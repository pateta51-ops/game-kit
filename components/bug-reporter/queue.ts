// Bug reports: the queue of reports not filed yet, kept in this browser's IndexedDB (a screenshot is too big for
// localStorage). Every report goes here first, so nothing is lost when filing fails; it stays until it is filed or
// deleted. If IndexedDB refuses (a private window), the queue lasts until the page closes.
import { createStore, del, entries, set, type UseStore } from 'idb-keyval';
import { create } from 'zustand';
import { bugConfig } from './config';
import { parseReport, type BugReport } from './report';

export interface QueuedReport {
  report: BugReport;
  /** Why the last attempt to file it failed, or null. */
  error: string | null;
}

/** Said wherever the queue is shown while IndexedDB refuses (a private window): the reports vanish when the page closes. */
export const MEMORY_ONLY_NOTE =
  'This browser will not store reports (a private window?), so they are kept only until this page closes. Download the report now, or send it.';

/** What the dialog says after "Keep in queue" (and the first half of the "Not sent" message). */
export const savedMessage = (memoryOnly: boolean): string =>
  memoryOnly
    ? `Kept in memory only, not saved. ${MEMORY_ONLY_NOTE}`
    : 'Saved in the queue (Settings > Bug reports > Send all).';

/** Where a not-sent report waits. */
export const safeInQueueMessage = (memoryOnly: boolean): string =>
  memoryOnly
    ? `It is kept in memory only until this page closes: Download it now. ${MEMORY_ONLY_NOTE}`
    : 'It is safe in the queue (Settings > Bug reports > Send all).';

let store: UseStore | null = null;
const memory = new Map<string, QueuedReport>();
const db = (): UseStore => (store ??= createStore(`${bugConfig().id}-bug-reports`, 'queue'));

async function readAll(): Promise<QueuedReport[]> {
  const out = new Map<string, QueuedReport>();
  try {
    for (const [key, value] of await entries(db())) {
      const parsed = parseReport(JSON.stringify((value as QueuedReport).report));
      if (parsed.ok)
        out.set(typeof key === 'string' ? key : parsed.report.id, {
          report: parsed.report,
          error: (value as QueuedReport).error,
        });
    }
  } catch {
    /* IndexedDB is unavailable: the in-memory queue stands */
    useQueue.setState({ memoryOnly: true });
  }
  // a copy still in memory is newer than IndexedDB's (it is dropped once its own write is confirmed)
  for (const [k, v] of memory) out.set(k, v);
  return [...out.values()].sort((a, b) => a.report.createdAt.localeCompare(b.report.createdAt));
}

interface QueueState {
  items: QueuedReport[];
  /** True once IndexedDB refused: the queue lives in memory and is lost when the page closes. */
  memoryOnly: boolean;
  refresh: () => Promise<void>;
}

export const useQueue = create<QueueState>((setState) => ({
  items: [],
  memoryOnly: false,
  refresh: async () => {
    setState({ items: await readAll() });
  },
}));

/** Whether a report is still in the queue (a row deleted while Send all runs is skipped). */
export const stillQueued = (id: string): boolean => useQueue.getState().items.some((i) => i.report.id === id);

/** Keep a report (new, or with the error of its last attempt). */
export async function queueReport(report: BugReport, error: string | null): Promise<void> {
  const item: QueuedReport = { report, error };
  memory.set(report.id, item);
  try {
    await set(report.id, item, db());
    if (memory.get(report.id) === item) memory.delete(report.id);
    useQueue.setState({ memoryOnly: false });
  } catch {
    /* kept in memory */
    useQueue.setState({ memoryOnly: true });
  }
  await useQueue.getState().refresh();
}

/** Drop a report (it was filed, or the owner deleted it). */
export async function unqueueReport(id: string): Promise<void> {
  memory.delete(id);
  try {
    await del(id, db());
  } catch {
    /* nothing stored */
  }
  await useQueue.getState().refresh();
}

/** The whole queue as one JSON file (an array of reports). */
export const queueText = (items: readonly QueuedReport[]): string =>
  JSON.stringify(items.map((i) => i.report));
