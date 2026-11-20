import { useContext, type ReactNode } from 'react';
import { Slots, type BugBtnProps } from './BugBtnCtx.ts';

export function Btn(o: { kind: string; testId: string; label: ReactNode; primary?: boolean; submit?: boolean; disabled?: boolean; onClick?: () => void; base?: string; pressed?: boolean; ariaLabel?: string; title?: string; noCapture?: boolean }) {
  const { buttonClass, renderButton } = useContext(Slots);
  const b: BugBtnProps = {
    kind: o.kind, testId: o.testId, label: o.label, onClick: o.onClick, disabled: o.disabled === true, type: o.submit === true ? 'submit' : 'button',
    className: `${o.base ?? 'bug-btn'}${o.primary === true ? ' primary' : ''}${buttonClass === undefined ? '' : ` ${buttonClass}`}`,
    pressed: o.pressed, ariaLabel: o.ariaLabel, title: o.title, noCapture: o.noCapture,
  };
  if (renderButton) return <>{renderButton(b)}</>;
  return (
    <button type={b.type} className={b.className} data-testid={b.testId} disabled={b.disabled} onClick={b.onClick} aria-pressed={b.pressed} aria-label={b.ariaLabel} title={b.title} data-no-capture={b.noCapture === true ? '' : undefined}>
      {b.label}
    </button>
  );
}
