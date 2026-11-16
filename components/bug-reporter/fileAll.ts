// Bug reports: filing queued reports, one at a time (a Send all
// button avoids errors submitting bugs). The reports in flight are one shared set, so a
// row's Send, the dialog's Send now and Send all never file the same report twice (two parallel filings of one report
// would each open an issue before either can find the other's). A report leaves the queue only once it is filed.
import { create } from 'zustand';
import { downloadText } from './download.ts';
import { fileReport, FilingError, type Compress, type FilingErrorKind, type GhTransport } from './github.ts';
import { queueReport, stillQueued as inQueue, unqueueReport, type QueuedReport } from './queue.ts';
import { reportFileName, reportHeadline, type BugReport } from './report.ts';

export const useFiling = create<{ ids: ReadonlySet<string> }>(() => ({ ids: new Set<string>() }));

const claim = (id: string): boolean => {
  const ids = useFiling.getState().ids;
  if (ids.has(id)) return false;
  useFiling.setState({ ids: new Set([...ids, id]) });
  return true;
};
const release = (id: string): void => {
  const ids = new Set(useFiling.getState().ids);
  ids.delete(id);
  useFiling.setState({ ids });
};

export type FileOutcome = 'sent' | 'failed' | 'busy' | 'gone';

export interface FileResult {
  id: string;
  title: string;
  outcome: FileOutcome;
  /** Why it failed, or what was not attached when it was sent. */
  message?: string;
  issueUrl?: string;
  issueNumber?: number;
  /** The kind of FilingError when it failed. */
  kind?: FilingErrorKind;
}

export const NO_TOKEN =
  'No GitHub token yet: paste one in Settings > Bug reports. The report stays in the queue.';

export interface FileDeps {
  /** The transport, or null when there is no token. */
  send: GhTransport | null;
  compress?: Compress;
  stillQueued?: (id: string) => boolean;
  /** Saves the whole report as a file when GitHub could not take the screenshot. */
  download?: (report: BugReport) => boolean;
}

const downloadReport = (report: BugReport): boolean =>
  downloadText(JSON.stringify(report), reportFileName(report));

/**
 * Files one queued report unless it is already being filed. On success it leaves the queue; on failure it stays queued
 * with the reason. A report deleted from the queue meanwhile is skipped.
 */
export async function fileQueued(report: BugReport, deps: FileDeps): Promise<FileResult> {
  const base = { id: report.id, title: reportHeadline(report) };
  // deleted while it was being filed: a failure must not bring it back
  const still = deps.stillQueued ?? inQueue;
  if (!still(report.id)) return { ...base, outcome: 'gone' };
  if (!claim(report.id)) return { ...base, outcome: 'busy' };
  try {
    if (deps.send === null) {
      if (still(report.id)) await queueReport(report, NO_TOKEN).catch(() => undefined);
      return { ...base, outcome: 'failed', message: NO_TOKEN, kind: 'token' };
    }
    let filed: Awaited<ReturnType<typeof fileReport>>;
    try {
      filed = await fileReport(report, deps.send, deps.compress);
    } catch (error) {
      const message = error instanceof FilingError ? error.message : 'Filing failed for an unknown reason.';
      if (still(report.id)) await queueReport(report, message).catch(() => undefined);
      return {
        ...base,
        outcome: 'failed',
        message,
        ...(error instanceof FilingError ? { kind: error.kind } : {}),
      };
    }
    let note: string | undefined;
    if (filed.screenshotMissing) {
      const saved = (deps.download ?? downloadReport)(report);
      note = saved
        ? `Filed without the screenshot; the full report was downloaded as ${reportFileName(report)}.`
        : 'Filed without the screenshot, and the browser would not download the report: use Download before deleting it.';
    } else if (filed.problems.length > 0) note = `Filed; not attached: ${filed.problems.join(' ')}`;
    // the screenshot is safe only in the queue when the download failed: keep it there
    if (!(filed.screenshotMissing && note?.includes('would not download') === true))
      await unqueueReport(report.id).catch(() => undefined);
    else if (still(report.id)) await queueReport(report, note ?? null).catch(() => undefined);
    return {
      ...base,
      outcome: 'sent',
      issueUrl: filed.issueUrl,
      issueNumber: filed.issueNumber,
      ...(note === undefined ? {} : { message: note }),
    };
  } finally {
    release(report.id);
  }
}

const STOP: ReadonlySet<FilingErrorKind> = new Set(['token', 'offline', 'rate']);

export interface SendAllSummary {
  sent: number;
  failed: number;
  skipped: number;
  results: FileResult[];
}

/** Files every report, one after another (never in parallel: each commits files to the same branch). */
export async function fileAll(
  reports: readonly QueuedReport[],
  deps: FileDeps,
  onProgress: (done: number, total: number) => void = () => undefined,
): Promise<SendAllSummary> {
  const results: FileResult[] = [];
  for (const { report } of reports) {
    let result: FileResult;
    try {
      result = await fileQueued(report, deps);
    } catch {
      result = { id: report.id, title: reportHeadline(report), outcome: 'failed', message: 'Filing failed.' };
    }
    results.push(result);
    onProgress(results.length, reports.length);
    // no token, a refused token, offline or rate-limited: every other report would fail the same way, so stop here
    if (result.outcome === 'failed' && result.kind !== undefined && STOP.has(result.kind)) {
      for (const rest of reports.slice(results.length))
        results.push({
          id: rest.report.id,
          title: reportHeadline(rest.report),
          outcome: 'failed',
          message: `Not tried: ${result.message ?? ''}`,
          kind: result.kind,
        });
      onProgress(reports.length, reports.length);
      break;
    }
  }
  return {
    sent: results.filter((r) => r.outcome === 'sent').length,
    failed: results.filter((r) => r.outcome === 'failed').length,
    skipped: results.filter((r) => r.outcome === 'busy' || r.outcome === 'gone').length,
    results,
  };
}
