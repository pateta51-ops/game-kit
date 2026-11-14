// Bug reports: Settings > Bug reports: the GitHub token (stored on this device only), the queue
// of reports not filed yet with "Send all bug reports" (one at a time, never the same report twice, failures stay queued
// with their reason, then a summary), and per report Send, Download and Delete. QueueBar is the same count and Send all
// for Home; BugButton is the table's button.
import { useEffect, useState } from 'react';
import { bugConfig, bugRepo } from './config';
import { openBugReport } from './dialogStore';
import { downloadText } from './download';
import { fileQueued, useFiling, type SendAllSummary } from './fileAll';
import { sendAllQueued, useSendAll } from './sendAll';
import { MEMORY_ONLY_NOTE, queueText, unqueueReport, useQueue, type QueuedReport } from './queue';
import { reportFileName, reportHeadline } from './report';
import { useToken } from './token';
import { sendDeps } from './transport';
import './bugs.css';

const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

function Summary({ summary }: { summary: SendAllSummary }) {
  const failed = summary.results.filter((r) => r.outcome === 'failed');
  const notes = summary.results.filter((r) => r.outcome === 'sent' && r.message !== undefined);
  return (
    <div
      className={`bug-summary${failed.length > 0 ? ' bad' : ''}`}
      role="status"
      data-testid="bug-send-summary"
    >
      <b>
        Sent {summary.sent}
        {failed.length > 0 ? `, failed ${String(failed.length)}` : ''}
        {summary.skipped > 0 ? `, skipped ${String(summary.skipped)} (already sending or deleted)` : ''}.
      </b>
      {failed.length > 0 && (
        <span> The failed reports stay in the queue; Send all again once the reason is fixed.</span>
      )}
      {(failed.length > 0 || notes.length > 0) && (
        <ul>
          {failed.map((r) => (
            <li key={r.id} data-testid="bug-summary-failed">
              <i>{r.title}</i>: {r.message}
            </li>
          ))}
          {notes.map((r) => (
            <li key={r.id}>
              <i>{r.title}</i>: {r.message}
            </li>
          ))}
        </ul>
      )}
      {summary.results.some((r) => r.issueUrl !== undefined) && (
        <p className="bug-note">
          Filed:{' '}
          {summary.results
            .filter((r) => r.issueUrl !== undefined)
            .map((r, i) => (
              <span key={r.id}>
                {i > 0 ? ', ' : ''}
                <a href={r.issueUrl} target="_blank" rel="noreferrer noopener">
                  #{r.issueNumber}
                </a>
              </span>
            ))}
        </p>
      )}
    </div>
  );
}

/** "N reports queued" with the Send all button, wherever the queue is shown. */
export function QueueBar({ compact = false }: { compact?: boolean }) {
  const items = useQueue((s) => s.items);
  const memoryOnly = useQueue((s) => s.memoryOnly);
  const refresh = useQueue((s) => s.refresh);
  const inFlight = useFiling((s) => s.ids.size > 0);
  const summary = useSendAll((s) => s.summary);
  const progress = useSendAll((s) => s.progress);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  if (compact && items.length === 0 && summary === null && !memoryOnly) return null;
  return (
    <div className={`bug-queuebar${compact ? ' compact' : ''}`} data-testid="bug-queuebar">
      <div className="bug-queuebar__row">
        <span className="bug-count" data-testid="bug-queue-count">
          {items.length === 0 ? 'No bug reports queued' : `${plural(items.length, 'bug report')} queued`}
        </span>
        <button
          type="button"
          className="bug-btn primary"
          data-testid="bug-send-all"
          disabled={inFlight || items.length === 0}
          onClick={() => {
            void sendAllQueued();
          }}
        >
          {progress ?? `Send all bug reports${items.length > 0 ? ` (${String(items.length)})` : ''}`}
        </button>
        {compact && (
          <a className="bug-link" href="#/settings">
            Details
          </a>
        )}
      </div>
      {memoryOnly && (
        <p className="bug-bad" role="alert" data-testid="bug-memory-only">
          {MEMORY_ONLY_NOTE}
        </p>
      )}
      {summary !== null && <Summary summary={summary} />}
    </div>
  );
}

function QueueRow({ item }: { item: QueuedReport }) {
  const { report } = item;
  const busy = useFiling((s) => s.ids.has(report.id));
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null);
  const shot = report.screenshot;
  return (
    <li className="bug-row" data-testid="bug-queue-item">
      {shot === null ? (
        <span className="bug-thumb none">No picture</span>
      ) : (
        <img className="bug-thumb" alt="" src={`data:image/png;base64,${shot.base64}`} />
      )}
      <div className="bug-row__what">
        <b>{reportHeadline(report)}</b>
        <span className="bug-note">
          {report.createdAt.slice(0, 16).replace('T', ' ')} · {report.details.route}
          {report.details.round === null ? '' : ` · Round ${String(report.details.round)}`}
        </span>
        {item.error !== null && (
          <span className="bug-bad" data-testid="bug-queue-error">
            Last try: {item.error}
          </span>
        )}
        {note !== null && <span className={note.bad ? 'bug-bad' : 'bug-ok'}>{note.text}</span>}
      </div>
      <div className="bug-row__btns">
        <button
          type="button"
          className="bug-btn"
          data-testid="bug-queue-send"
          disabled={busy}
          onClick={() => {
            void fileQueued(report, sendDeps()).then((r) => {
              if (r.outcome === 'failed') setNote({ bad: true, text: r.message ?? 'Filing failed.' });
              if (r.outcome === 'busy') setNote({ bad: false, text: 'Already being sent.' });
              // sent with a note (filed without the screenshot): the row may stay only when the download failed
              if (r.outcome === 'sent' && r.message !== undefined) setNote({ bad: true, text: r.message });
            });
          }}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          className="bug-btn"
          data-testid="bug-queue-download"
          onClick={() => {
            downloadText(JSON.stringify(report), reportFileName(report));
          }}
        >
          Download
        </button>
        <button
          type="button"
          className="bug-btn"
          data-testid="bug-queue-delete"
          disabled={busy}
          onClick={() => {
            void unqueueReport(report.id);
          }}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function TokenRow() {
  const hasToken = useToken((s) => s.has);
  const save = useToken((s) => s.save);
  const forget = useToken((s) => s.forget);
  const [entry, setEntry] = useState('');
  const [bad, setBad] = useState(false);
  return (
    <div className="bug-token">
      <h3>GitHub token</h3>
      <p className="bug-note">
        A fine-grained token for {bugRepo().owner}/{bugRepo().repo} only, with Issues and Contents (read and write). It
        stays in this browser on this device; it is never in a save, a report or a log.
      </p>
      {hasToken ? (
        <div className="bug-token__row">
          <span className="bug-ok" data-testid="bug-token-state">
            Token saved (hidden)
          </span>
          <button type="button" className="bug-btn" data-testid="bug-token-forget" onClick={forget}>
            Forget the token
          </button>
        </div>
      ) : (
        <form
          className="bug-token__row"
          onSubmit={(e) => {
            e.preventDefault();
            const ok = save(entry);
            setBad(!ok);
            if (ok) setEntry('');
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="github_pat_…"
            aria-label="GitHub token"
            data-testid="bug-token-input"
            value={entry}
            onChange={(e) => {
              setEntry(e.target.value);
            }}
          />
          <button type="submit" className="bug-btn" data-testid="bug-token-save">
            Save the token
          </button>
          {bad && <span className="bug-bad">That is not a token (empty, or it has spaces).</span>}
        </form>
      )}
    </div>
  );
}

/** Settings > Bug reports. */
export function BugSettings() {
  const items = useQueue((s) => s.items);
  return (
    <section className="book bug-book" data-testid="bug-settings">
      <h2>Bug reports</h2>
      <div className="bug-book__top">
        <QueueBar />
        <div className="bug-book__more">
          <button type="button" className="bug-btn" data-testid="bug-report-open" onClick={openBugReport}>
            Report a bug (F8)
          </button>
          <button
            type="button"
            className="bug-btn"
            data-testid="bug-queue-download-all"
            disabled={items.length === 0}
            onClick={() => {
              downloadText(queueText(items), `${bugConfig().id}-bug-queue-${new Date().toISOString().slice(0, 10)}.json`);
            }}
          >
            Download all
          </button>
        </div>
      </div>
      {items.length > 0 && (
        <ul className="bug-list" data-testid="bug-queue-list">
          {items.map((item) => (
            <QueueRow key={item.report.id} item={item} />
          ))}
        </ul>
      )}
      <TokenRow />
    </section>
  );
}

/** The table's button: next to Settings on desktop, an icon on the phone. */
export function BugButton() {
  const count = useQueue((s) => s.items.length);
  const refresh = useQueue((s) => s.refresh);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <button
      className="bug-table-btn"
      data-testid="open-bug-report"
      title="Report a bug (F8)"
      onClick={openBugReport}
    >
      <svg className="bug-ico" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 4.5a3.5 3.5 0 0 1 3.4 2.7A6 6 0 0 1 18 11.5V12h3v2h-3v1a6 6 0 0 1-.3 1.8l2.6 1.5-1 1.7-2.5-1.4A6 6 0 0 1 12 21a6 6 0 0 1-4.8-2.4l-2.5 1.4-1-1.7 2.6-1.5A6 6 0 0 1 6 15v-1H3v-2h3v-.5a6 6 0 0 1 2.6-4.3A3.5 3.5 0 0 1 12 4.5zM11 11v8.9a4 4 0 0 0 2 0V11z"
        />
      </svg>
      <span>Report bug</span>
      {count > 0 && (
        <em className="bug-badge" data-testid="bug-table-count">
          {count}
        </em>
      )}
    </button>
  );
}
