// Bug reports: the dialog (the table's bug button, Home, Settings, or F8): what happened, and an
// optional markup of the screenshot. The screenshot is taken before the dialog opens, so the dialog is not in it. Every
// report goes to the local queue first (IndexedDB), so nothing is lost when filing fails; "Send now" then files it as a
// GitHub issue with the token from Settings, and a failure leaves it queued with the reason (Settings > Send all).
import { useEffect, useRef, useState } from 'react';
import { bugConfig } from './config.ts';
import { collectReport } from './collect.ts';
import { openBugReport, useBugDialog } from './dialogStore.ts';
import { downloadText } from '../small-helpers/download.ts';
import { fileQueued } from './fileAll.ts';
import { MarkupEditor } from './markup/MarkupEditor.tsx';
import { flattenMarkup, type Markup } from './markup/model.ts';
import { queueReport, safeInQueueMessage, savedMessage, useQueue } from './queue.ts';
import { reportFileName, type BugReport } from './report.ts';
import { useToken } from './token.ts';
import { installDevBugHooks, sendDeps } from './transport.ts';
import { Btn, Slots, type BugBtnSlots } from './BugSettings.tsx';
import './bugs.css';

type Outcome =
  | { kind: 'none' }
  | { kind: 'busy'; message: string }
  | { kind: 'queued'; message: string }
  | { kind: 'filed'; url: string; number: number; note?: string }
  | { kind: 'failed'; message: string }
  | { kind: 'exported'; message: string };

const QUEUE_FAILED = 'The report could not be saved in the queue. Download it instead, then try again.';

function Dialog({ screenshot, close }: { screenshot: string | null; close: () => void }) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [past, setPast] = useState<Markup[][]>([]);
  const [future, setFuture] = useState<Markup[][]>([]);
  const [markup, setMarkup] = useState<Markup[]>([]);
  const [marked, setMarked] = useState(screenshot);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' });
  const memoryOnly = useQueue((s) => s.memoryOnly);
  const hasToken = useToken((s) => s.has);
  const busy = outcome.kind === 'busy' || rendering;
  const done = outcome.kind === 'filed' || outcome.kind === 'queued';
  const [snapshot] = useState(() => collectReport('', screenshot));
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    area.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy && !editing) close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [busy, close, editing]);
  const make = (): BugReport => ({
    ...snapshot,
    explanation: text,
    markup,
    screenshot: marked === null ? null : { mime: 'image/png', base64: marked },
    originalScreenshot:
      markup.length && screenshot !== null ? { mime: 'image/png', base64: screenshot } : null,
  });
  const finishEditing = (): void => {
    setEditing(false);
    if (screenshot === null) return;
    setRendering(true);
    flattenMarkup(screenshot, markup).then(
      (image) => {
        setMarked(image);
        setRendering(false);
      },
      () => {
        setRendering(false);
        setOutcome({ kind: 'failed', message: 'Could not draw the marked screenshot. Try again.' });
      },
    );
  };
  const keep = async (): Promise<BugReport | null> => {
    const report = make();
    try {
      await queueReport(report, null);
      return report;
    } catch {
      setOutcome({ kind: 'failed', message: QUEUE_FAILED });
      return null;
    }
  };
  const send = async (): Promise<void> => {
    setOutcome({ kind: 'busy', message: 'Saving in the queue, then sending to GitHub…' });
    const report = await keep();
    if (report === null) return;
    const result = await fileQueued(report, sendDeps());
    if (result.outcome === 'sent')
      setOutcome({
        kind: 'filed',
        url: result.issueUrl ?? '',
        number: result.issueNumber ?? 0,
        ...(result.message === undefined ? {} : { note: result.message }),
      });
    else
      setOutcome({
        kind: 'queued',
        message: `Not sent: ${result.message ?? 'filing failed.'} ${safeInQueueMessage(useQueue.getState().memoryOnly)}`,
      });
  };

  return (
    <div className="bug-backdrop" data-testid="bug-dialog" data-no-capture="">
      <div className="bugdlg" role="dialog" aria-modal="true" aria-label="Report a bug">
        <h2>Report a bug</h2>
        <div className="bugdlg__body">
          {screenshot === null ? (
            <p className="bug-note" data-testid="bug-no-shot">
              The browser could not take a screenshot; the report goes without one.
            </p>
          ) : (
            <div className="bugdlg__shotcol">
              <img
                className="bugdlg__shot"
                data-testid="bug-shot"
                alt="Screenshot of the screen"
                src={`data:image/png;base64,${marked ?? ''}`}
              />
              <Btn
                kind="markup"
                testId="bug-markup"
                disabled={busy || done}
                onClick={() => {
                  setEditing(true);
                }}
                label={<>Mark up screenshot{markup.length ? ` (${String(markup.length)})` : ''}</>}
              />
            </div>
          )}
          <div className="bugdlg__textcol">
            <label className="bugdlg__label" htmlFor="bug-explanation">
              What happened, and what did you expect?
            </label>
            <textarea
              id="bug-explanation"
              ref={area}
              className="bugdlg__text"
              data-testid="bug-explanation"
              rows={4}
              value={text}
              disabled={busy || done}
              onChange={(e) => {
                setText(e.target.value);
              }}
            />
            <p className="bug-note">
              The report holds the screenshot, the game so far (a save that Saves &gt; Import loads), the open
              prompt, the last 50 log lines, the build, the browser and the screen size. It is saved in the
              queue on this device first, so nothing is lost if sending fails.
              {hasToken ? '' : ' No GitHub token yet (Settings > Bug reports): Send now keeps it queued.'}
            </p>
          </div>
        </div>
        {editing && screenshot !== null && (
          <MarkupEditor
            past={past}
            future={future}
            setPast={setPast}
            setFuture={setFuture}
            original={screenshot}
            items={markup}
            onChange={setMarkup}
            onClose={finishEditing}
          />
        )}
        {outcome.kind === 'filed' ? (
          <p role="status" className="bug-ok" data-testid="bug-result">
            Filed as{' '}
            <a href={outcome.url} target="_blank" rel="noreferrer noopener" data-testid="bug-issue-link">
              issue #{outcome.number}
            </a>
            .{outcome.note === undefined ? '' : ` ${outcome.note}`}
          </p>
        ) : outcome.kind === 'failed' ? (
          <p role="alert" className="bug-bad" data-testid="bug-result">
            {outcome.message}
          </p>
        ) : outcome.kind !== 'none' ? (
          <p
            role="status"
            className={
              outcome.kind === 'queued' && (outcome.message.startsWith('Not sent') || memoryOnly)
                ? 'bug-bad'
                : 'bug-ok'
            }
            data-testid="bug-result"
          >
            {outcome.message}
          </p>
        ) : null}
        <div className="bugdlg__buttons">
          <Btn
            kind="send"
            primary
            testId="bug-send"
            disabled={busy || done}
            onClick={() => {
              void send();
            }}
            label={outcome.kind === 'busy' ? 'Sending…' : 'Send now'}
          />
          <Btn
            kind="queue"
            testId="bug-queue"
            disabled={busy || done}
            onClick={() => {
              setOutcome({ kind: 'busy', message: 'Saving in the queue…' });
              void keep().then((r) => {
                if (r !== null)
                  setOutcome({
                    kind: 'queued',
                    message: savedMessage(useQueue.getState().memoryOnly),
                  });
              });
            }}
            label="Keep in queue"
          />
          <Btn
            kind="export"
            primary={memoryOnly && outcome.kind === 'queued'}
            testId="bug-export"
            disabled={busy}
            onClick={() => {
              const report = make();
              setOutcome(
                downloadText(JSON.stringify(report), reportFileName(report))
                  ? { kind: 'exported', message: `Downloaded as ${reportFileName(report)}.` }
                  : { kind: 'failed', message: 'The browser would not save the file.' },
              );
            }}
            label="Download"
          />
          <Btn kind="cancel" testId="bug-cancel" disabled={busy} onClick={close} label={done ? 'Close' : 'Cancel'} />
        </div>
      </div>
    </div>
  );
}

/** Mounted once, by the App: draws the dialog while a report is being made, and opens it on F8. */
export function BugReportHost(slots: BugBtnSlots = {}) {
  const dialog = useBugDialog((s) => s.dialog);
  const close = useBugDialog((s) => s.close);
  useEffect(() => {
    if (bugConfig().dev === true) installDevBugHooks();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'F8') {
        event.preventDefault();
        openBugReport();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  if (dialog.phase === 'capturing') return <div hidden data-testid="bug-capturing" data-no-capture="" />;
  return dialog.phase === 'open' ? (
    <Slots.Provider value={slots}>
      <Dialog screenshot={dialog.screenshot} close={close} />
    </Slots.Provider>
  ) : null;
}
