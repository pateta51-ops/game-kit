// The crash screen for an error boundary's fallback: the words, what went wrong, a download of the current save and a
// reload. The game injects how to get the save and the texts. Nothing the export does can throw out of this screen.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import './frame.css';
import { CRASH_WORDS, downloadSave, errorWords, type CrashWords, type SaveData } from './crashWords';

export interface CrashScreenProps {
  error: Error;
  /** The current save, or null when there is none. Without it the screen has no export button. */
  getSave?: (() => SaveData | null | undefined | Promise<SaveData | null | undefined>) | undefined;
  fileName?: string | undefined;
  download?: ((data: SaveData, fileName: string) => void) | undefined;
  reload?: (() => void) | undefined;
  /** The boundary's retry; without it the screen has no Try again button. */
  retry?: (() => void) | undefined;
  words?: Partial<CrashWords> | undefined;
  /** How long getSave may take before the export counts as failed. */
  timeoutMs?: number | undefined;
  children?: ReactNode;
}

type ExportState = 'idle' | 'busy' | 'saved' | 'none' | 'failed';

export function CrashScreen({ error, getSave, fileName = 'save.json', download = downloadSave, reload, retry, words, timeoutMs = 10000, children }: CrashScreenProps) {
  const w = { ...CRASH_WORDS, ...Object.fromEntries((Object.entries(words ?? {}) as [string, unknown][]).filter(([, v]) => v !== undefined)) };
  const [state, set] = useState<ExportState>('idle');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const setState = (s: ExportState): void => {
    if (alive.current) set(s);
  };
  const run = async (): Promise<void> => {
    if (getSave === undefined) return;
    setState('busy');
    let t: ReturnType<typeof setTimeout> | undefined;
    try {
      const data = await Promise.race([
        Promise.resolve().then(getSave),
        new Promise<never>((_, no) => {
          t = setTimeout(() => no(new Error('timeout')), timeoutMs);
        }),
      ]);
      if (!alive.current) return;
      if (data === null || data === undefined) setState('none');
      else {
        download(data, fileName);
        setState('saved');
      }
    } catch {
      setState('failed');
    } finally {
      clearTimeout(t);
    }
  };
  const said = { idle: '', busy: w.exporting, saved: w.exported, none: w.noSave, failed: w.exportFailed }[state];
  return (
    <div className="kit-af-crash" role="alert" data-testid="crash">
      <p>{w.failed}</p>
      <p className="kit-af-error" data-testid="crash-error">
        {errorWords(error)}
      </p>
      {children}
      {getSave !== undefined && (
        <button type="button" className="kit-af-btn" data-testid="crash-export" disabled={state === 'busy'} onClick={() => void run()}>
          {w.exportSave}
        </button>
      )}
      <button type="button" className="kit-af-btn" data-testid="crash-reload" onClick={reload ?? (() => window.location.reload())}>
        {w.reload}
      </button>
      {retry !== undefined && (
        <button type="button" className="kit-af-btn" data-testid="crash-retry" onClick={retry}>
          {w.retry}
        </button>
      )}
      {said !== '' && (
        <p className="kit-af-export" role="status" data-testid="crash-export-state" data-state={state}>
          {said}
        </p>
      )}
    </div>
  );
}
