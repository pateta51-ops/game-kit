import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GUARD_MS, guardClose, guardTap, type GuardState } from './guard.ts';

export type GuardedButtonProps = {
  onFire: () => void;
  children?: ReactNode;
  guardLabel?: ReactNode;
  barred?: boolean;
  reason?: string;
  timeoutMs?: number;
  resetKey?: unknown;
  initial?: GuardState;
  className?: string;
};

export function GuardedButton({ onFire, children, guardLabel, barred = false, reason, timeoutMs = GUARD_MS, resetKey, initial = 'guarded', className }: GuardedButtonProps) {
  const [state, setState] = useState<GuardState>(initial);
  const root = useRef<HTMLSpanElement>(null);
  const fire = useRef(onFire);
  useEffect(() => { fire.current = onFire; });
  const first = useRef(true);
  const tap = useCallback(() => {
    const r = guardTap(state, barred);
    setState(r.state);
    if (r.fire) fire.current();
  }, [state, barred]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setState('guarded');
  }, [resetKey]);
  useEffect(() => {
    if (state !== 'open') return;
    const close = () => { setState(guardClose); };
    const t = timeoutMs > 0 ? setTimeout(close, timeoutMs) : undefined;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const away = (e: Event) => { if (!root.current?.contains(e.target as Node)) close(); };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', away);
    return () => { clearTimeout(t); document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', away); };
  }, [state, timeoutMs]);
  const st = barred ? 'barred' : state;
  return (
    <span ref={root} className={className} style={{ perspective: 600 }} data-part="guarded-button" data-state={st}>
      <button type="button" data-kit data-part="button" data-state={st} title={barred ? reason : undefined} data-reason={barred ? reason : undefined} aria-disabled={barred || undefined} onClick={tap}>{children}</button>
      {!barred && <span data-part="guard" data-state={state} data-open={state !== 'guarded'} role={state === 'guarded' ? 'button' : undefined} onClick={state === 'guarded' ? tap : undefined} style={{ transformOrigin: 'top', transform: state === 'guarded' ? 'rotateX(0deg)' : 'rotateX(-100deg)', transition: 'transform var(--guarded-button-swing-ms, 300ms) ease-out', pointerEvents: state === 'guarded' ? undefined : 'none' }}>{state === 'guarded' ? guardLabel : null}</span>}
    </span>
  );
}
