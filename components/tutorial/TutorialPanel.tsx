// The narration panel: "Step N of M", the step's narration (drawn by the game's own text renderer), what the step asks
// for, and Back, Next, Leave and Close. It holds no game state: the game passes the lock and the session phase in.
import { useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { TutorialLock } from './lock.ts';
import type { TutorialPhase } from './machine.ts';
import { PANEL_WORDS } from './words.ts';
import './tutorial.css';

export type TutorialSide = 'top' | 'bottom' | 'left' | 'right';
/** What the game's own button component receives; it spreads `data-tutorial-next` onto its element. */
export interface TutorialButtonProps {
  readonly kind: 'next' | 'back' | 'close' | 'leave' | 'fold';
  readonly onClick: () => void;
  readonly disabled?: boolean | undefined;
  readonly title?: string | undefined;
  readonly 'data-tutorial-next'?: '' | undefined;
  readonly children: ReactNode;
}

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
  /** Paced steps still play (no prompt open yet): while `pacing` and `onSkip` are given, Next on an explaining or auto step is
      enabled and calls `onSkip` (the game's skip-pacing) instead of `onNext`. */
  readonly pacing?: boolean;
  readonly onSkip?: () => void;
  readonly onBack?: () => void;
  readonly onLeave: () => void;
  readonly onClose: () => void;
  /** Docked (the phone): the game's layout places it; the highlight leaves it alone. */
  readonly docked?: boolean;
  /** Docked on that edge of the window (implies `docked`): `<html>` gets `data-tut-side` and `--tut-reserve` (the panel's
      height, or width on left and right), so the game's screen can shrink beside the panel. */
  readonly side?: TutorialSide;
  /** The game's own button component, for every panel button (default: plain buttons). */
  readonly button?: ComponentType<TutorialButtonProps>;
  /** Extra lines under the narration (a "why", printed card text). */
  readonly children?: ReactNode;
}

export function TutorialPanel(p: TutorialPanelProps) {
  const w = { ...PANEL_WORDS, ...p.words };
  const text = p.text ?? ((s: string) => s);
  const [folded, setFolded] = useState<number | null>(null);
  const { lock, side } = p;
  const box = useRef<HTMLElement>(null);
  const shown = p.phase !== 'off' && p.phase !== 'closed';
  useLayoutEffect(() => {
    const el = box.current;
    if (side === undefined || !shown || el === null) return;
    const root = document.documentElement;
    const set = () => {
      root.dataset['tutSide'] = side;
      root.style.setProperty('--tut-reserve', `${String(side === 'left' || side === 'right' ? el.offsetWidth : el.offsetHeight)}px`);
    };
    set();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      delete root.dataset['tutSide'];
      root.style.removeProperty('--tut-reserve');
    };
  }, [side, shown, lock.stepNo, folded]);
  const B = p.button;
  if (p.phase === 'off' || p.phase === 'closed') return null;
  const closing = p.phase === 'closing';
  const step = closing ? null : lock.step;
  const isFolded = folded === lock.stepNo;
  const skip = p.pacing === true && p.onSkip !== undefined && lock.phase === 'guided' && lock.waitFor !== 'move';
  const next = skip ? { enabled: true } : lock.button('next');
  const onNext = skip && p.onSkip ? p.onSkip : p.onNext;
  return (
    <section className="kit-tutorial-panel" data-tutorial-panel data-step={lock.stepNo} data-docked={p.docked === true || side !== undefined ? '' : undefined} data-side={side} ref={box} aria-label={typeof p.title === 'string' ? p.title : 'Tutorial'}>
      <header className="kit-tutorial-head">
        {p.title !== undefined && <h2>{p.title}</h2>}
        <span className="kit-tutorial-count">{w.step(lock.stepNo, lock.total)}</span>
        {B !== undefined ? (
          <B kind="fold" onClick={() => setFolded(isFolded ? null : lock.stepNo)}>
            {isFolded ? w.show : w.hide}
          </B>
        ) : (
          <button type="button" className="kit-tutorial-link" onClick={() => setFolded(isFolded ? null : lock.stepNo)}>
            {isFolded ? w.show : w.hide}
          </button>
        )}
      </header>
      {!isFolded && (
        <div className="kit-tutorial-copy" key={lock.stepNo}>
          <p>{text(step?.narration ?? p.outro ?? w.over)}</p>
          {p.children}
        </div>
      )}
      <footer className="kit-tutorial-move">
        {p.onBack !== undefined && B !== undefined && (
          <B kind="back" onClick={p.onBack} disabled={!closing && lock.stepNo <= 1}>
            {w.back}
          </B>
        )}
        {p.onBack !== undefined && B === undefined && (
          <button type="button" onClick={p.onBack} disabled={!closing && lock.stepNo <= 1}>
            {w.back}
          </button>
        )}
        {closing ? (
          B !== undefined ? (
            <B kind="close" data-tutorial-next="" onClick={p.onClose}>
              {w.close}
            </B>
          ) : (
          <button type="button" data-tutorial-next onClick={p.onClose}>
            {w.close}
          </button>
          )
        ) : lock.waitFor === 'move' ? (
          <p className="kit-tutorial-asks">
            <b>{w.yourMove} </b>
            {text(lock.asks)}
          </p>
        ) : B !== undefined ? (
          <B kind="next" data-tutorial-next="" onClick={onNext} disabled={!next.enabled} title={next.why}>
            {w.next}
          </B>
        ) : (
          <button type="button" data-tutorial-next onClick={onNext} disabled={!next.enabled} title={next.why}>
            {w.next}
          </button>
        )}
        {!closing && B !== undefined && (
          <B kind="leave" onClick={p.onLeave}>
            {w.leave}
          </B>
        )}
        {!closing && B === undefined && (
          <button type="button" className="kit-tutorial-link" onClick={p.onLeave}>
            {w.leave}
          </button>
        )}
      </footer>
    </section>
  );
}
