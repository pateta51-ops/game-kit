import { useContext, type ReactNode } from 'react';
import { Slots, type BugBtnProps } from './BugBtnCtx.ts';

export function Btn(o: { kind: string; testId: string; label: ReactNode; primary?: boolean; submit?: boolean; disabled?: boolean; onClick?: () => void }) {
  const { buttonClass, renderButton } = useContext(Slots);
  const b: BugBtnProps = {
    kind: o.kind, testId: o.testId, label: o.label, onClick: o.onClick, disabled: o.disabled === true, type: o.submit === true ? 'submit' : 'button',
    className: `bug-btn${o.primary === true ? ' primary' : ''}${buttonClass === undefined ? '' : ` ${buttonClass}`}`,
  };
  if (renderButton) return <>{renderButton(b)}</>;
  return (
    <button type={b.type} className={b.className} data-testid={b.testId} disabled={b.disabled} onClick={b.onClick}>
      {b.label}
    </button>
  );
}
