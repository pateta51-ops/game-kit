import { applyUpdate, useUpdate } from './register.ts';
import './offline.css';
import { UPDATE_WORDS } from './words.ts';


/** The update line: shown only while a newer version waits (or is taking over). */
export function UpdateLine({ words, className }: { words?: Partial<typeof UPDATE_WORDS>; className?: string }) {
  const state = useUpdate((s) => s.state);
  if (state !== 'ready' && state !== 'reloading') return null;
  const w = { ...UPDATE_WORDS, ...words };
  return (
    <p className={`kit-upd ${className ?? ''}`} role="status" data-testid="update-line">
      <span>{w.line}</span>
      <button
        type="button"
        className="kit-upd-btn"
        data-testid="update-reload"
        disabled={state === 'reloading'}
        onClick={() => {
          applyUpdate();
        }}
      >
        {w.reload}
      </button>
    </p>
  );
}
