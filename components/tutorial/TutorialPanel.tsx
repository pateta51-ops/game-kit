// The narration panel: "Step N of M", the step's narration (drawn by the game's own text renderer), what the step asks
// for, and Back, Next, Leave and Close. It holds no game state: the game passes the lock and the session phase in.
import { useState, type ReactNode } from 'react';
import type { TutorialLock } from './lock';
import type { TutorialPhase } from './machine';
import { PANEL_WORDS } from './words';
import './tutorial.css';


export interface TutorialPanelProps {
  readonly lock: TutorialLock;
  readonly phase: TutorialPhase;
  readonly title?: ReactNode;
  /** The game's renderer for narration and "asks" (tokens, icons, glossary links); default: plain text. */
  readonly text?: (s: string) => ReactNode;
  readonly words?: Partial<typeof PANEL_WORDS>;
  /** The closing words shown after the last step (default `words.over`). */
  readonly outro?: string;
  readonly onNext: () => void;
  readonly onBack?: () => void;
  readonly onLeave: () => void;
  readonly onClose: () => void;
  /** Docked (the phone): the game's layout places it; the highlight leaves it alone. */
  readonly docked?: boolean;
  /** Extra lines under the narration (a "why", printed card text). */
  readonly children?: ReactNode;
}

export function TutorialPanel(p: TutorialPanelProps) {
  const w = { ...PANEL_WORDS, ...p.words };
  const text = p.text ?? ((s: string) => s);
  const [folded, setFolded] = useState<number | null>(null);
  const { lock } = p;
  if (p.phase === 'off' || p.phase === 'closed') return null;
  const closing = p.phase === 'closing';
  const step = closing ? null : lock.step;
  const isFolded = folded === lock.stepNo;
  const next = lock.button('next');
  return (
    <section className="kit-tutorial-panel" data-tutorial-panel data-step={lock.stepNo} data-docked={p.docked === true ? '' : undefined} aria-label={typeof p.title === 'string' ? p.title : 'Tutorial'}>
      <header className="kit-tutorial-head">
        {p.title !== undefined && <h2>{p.title}</h2>}
        <span className="kit-tutorial-count">{w.step(lock.stepNo, lock.total)}</span>
        <button type="button" className="kit-tutorial-link" onClick={() => setFolded(isFolded ? null : lock.stepNo)}>
          {isFolded ? w.show : w.hide}
        </button>
      </header>
      {!isFolded && (
        <div className="kit-tutorial-copy" key={lock.stepNo}>
          <p>{text(step?.narration ?? p.outro ?? w.over)}</p>
          {p.children}
        </div>
      )}
      <footer className="kit-tutorial-move">
        {p.onBack !== undefined && (
          <button type="button" onClick={p.onBack} disabled={!closing && lock.stepNo <= 1}>
            {w.back}
          </button>
        )}
        {closing ? (
          <button type="button" data-tutorial-next onClick={p.onClose}>
            {w.close}
          </button>
        ) : lock.waitFor === 'move' ? (
          <p className="kit-tutorial-asks">
            <b>{w.yourMove} </b>
            {text(lock.asks)}
          </p>
        ) : (
          <button type="button" data-tutorial-next onClick={p.onNext} disabled={!next.enabled} title={next.why}>
            {w.next}
          </button>
        )}
        {!closing && (
          <button type="button" className="kit-tutorial-link" onClick={p.onLeave}>
            {w.leave}
          </button>
        )}
      </footer>
    </section>
  );
}
