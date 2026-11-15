// The bottom sheet: a full-screen layer (100dvh), a scrim that closes it, the panel at its bottom up to --pm-sheet-max of
// the screen, with a handle, a title, a 44 px close button, a scrolling body and an optional foot in the thumb zone.
import { useId, type ReactNode } from 'react';
import './phone-mode.css';

export function Sheet({
  title,
  onClose,
  children,
  foot,
  testId = 'phone-sheet',
  height,
  slideMs = 220,
  closeLabel = 'Close',
  closeText = '✕',
  className = '',
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  foot?: ReactNode;
  testId?: string;
  /** A fixed height in CSS px; the default fits the content up to --pm-sheet-max. */
  height?: number;
  /** The slide-in time; 0 for none (the game's motion setting). */
  slideMs?: number;
  closeLabel?: string;
  closeText?: ReactNode;
  /** Extra classes on the panel (the game's surface). */
  className?: string;
}) {
  const id = useId();
  return (
    <div className="kit-pm-layer">
      <div className="kit-pm-scrim" data-testid={`${testId}-scrim`} onClick={onClose} />
      <section
        className={`kit-pm-sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        data-testid={testId}
        style={{ animationDuration: `${String(slideMs)}ms`, ...(height ? { height } : {}) }}
      >
        <header className="kit-pm-sheet-hd">
          <span className="kit-pm-sheet-title" id={id}>
            {title}
          </span>
          <button type="button" className="kit-pm-x" aria-label={closeLabel} data-testid={`${testId}-close`} onClick={onClose}>
            {closeText}
          </button>
        </header>
        <div className="kit-pm-sheet-body">{children}</div>
        {foot !== undefined && <footer className="kit-pm-sheet-foot">{foot}</footer>}
      </section>
    </div>
  );
}

/** Over every screen while a phone is held sideways; the game stays mounted underneath, so turning back loses nothing. */
export function RotatePanel({ children, testId = 'rotate-panel' }: { children: ReactNode; testId?: string }) {
  return (
    <div className="kit-pm-rotate" data-testid={testId} data-no-capture="">
      {children}
    </div>
  );
}
