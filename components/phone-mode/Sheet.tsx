// The bottom sheet: a full-screen layer (100dvh), a scrim that closes it, the panel at its bottom up to --pm-sheet-max of
// the screen, with a handle, a title, a 44 px close button, a scrolling body and an optional foot in the thumb zone.
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as PE, type ReactNode } from 'react';
import './phone-mode.css';

/** Imperium's: a swipe down on the head past this many px closes the sheet, a shorter drag springs back. */
export const SWIPE_CLOSE_PX = 70;
/** Imperium's: a scrim tap this soon after the sheet opened is the end of a double tap, not a close. Pass as `arriveMs`. */
export const ARRIVE_MS = 250;

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
  arriveMs = 0,
  leaveMs = 0,
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
  /** Scrim taps in the first `arriveMs` are ignored (ARRIVE_MS = 250, Imperium's); 0 for none. */
  arriveMs?: number;
  /** Imperium's slide-down after a close request (it uses 240); the layer is `inert` meanwhile and `onClose` runs at its end. 0, `slideMs` 0 or reduced motion: closes at once. */
  leaveMs?: number;
}) {
  const id = useId();
  const layer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLElement>(null);
  const t0 = useRef(0);
  const drag = useRef<{ y0: number; dy: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const req = useRef<() => void>(() => undefined);
  useEffect(() => {
    req.current = () => {
      if (leaving) return;
      const still = slideMs === 0 || leaveMs === 0 || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (still) return onClose();
      setLeaving(true);
      setTimeout(onClose, leaveMs);
    };
  });
  const request = () => req.current();
  useEffect(() => {
    t0.current = performance.now();
    const from = document.activeElement as HTMLElement | null;
    const el = layer.current;
    const behind = [...(el?.parentElement?.children ?? [])].filter((c): c is HTMLElement => c !== el && c instanceof HTMLElement && !c.hasAttribute('inert'));
    for (const c of behind) c.setAttribute('inert', '');
    box.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      req.current();
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      for (const c of behind) c.removeAttribute('inert');
      from?.focus?.({ preventScroll: true });
    };
  }, []);
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !box.current) return;
    if (d.dy > SWIPE_CLOSE_PX) return request();
    box.current.style.transition = '';
    box.current.style.transform = '';
  };
  const swipe = {
    onPointerDown: (e: PE<HTMLElement>) => {
      if ((e.target as Element).closest('button')) return;
      drag.current = { y0: e.clientY, dy: 0 };
      if (box.current) box.current.style.transition = 'none';
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PE<HTMLElement>) => {
      const d = drag.current;
      if (!d || !box.current) return;
      d.dy = Math.max(0, e.clientY - d.y0);
      box.current.style.transform = `translateY(${String(d.dy)}px)`;
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
  const ms = `${String(leaveMs)}ms`;
  return (
    <div className="kit-pm-layer" ref={layer} data-state={leaving ? 'leaving' : 'open'} inert={leaving} style={{ '--pm-leave': ms } as CSSProperties}>
      <div className="kit-pm-scrim" data-testid={`${testId}-scrim`} style={{ animationDuration: `${String(slideMs)}ms` }} onClick={() => { if (performance.now() - t0.current >= arriveMs) request(); }} />
      <section
        ref={box}
        tabIndex={-1}
        className={`kit-pm-sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        data-testid={testId}
        style={{ animationDuration: `${String(slideMs)}ms`, ...(height ? { height } : {}), ...(leaving ? { transition: `transform ${ms} ease-in`, transform: 'translateY(105%)' } : {}) }}
      >
        <header className="kit-pm-sheet-hd" {...swipe}>
          <span className="kit-pm-sheet-title" id={id}>
            {title}
          </span>
          <button type="button" className="kit-pm-x" aria-label={closeLabel} data-testid={`${testId}-close`} onClick={request}>
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
