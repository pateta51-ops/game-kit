import { useEffect, useEffectEvent, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './modal-dialog.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let openCount = 0;
let previousOverflow = '';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  closeOnBackdrop?: boolean;
  speed?: number;
}

export function Modal({ open, onClose, title, children, actions, closeOnBackdrop = true, speed = 1 }: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const panel = dialog.current;
    if (!open || !panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openCount++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    const first = panel.querySelector<HTMLElement>('[data-autofocus]') ??
      panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    first.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const dialogs = document.querySelectorAll('.kc-modal-backdrop:not([hidden]) > .kc-modal');
      if (dialogs[dialogs.length - 1] !== panel) return;
      event.stopPropagation();
      close();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (--openCount === 0) document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="kc-modal-backdrop"
      hidden={!open}
      inert={!open}
      style={{ '--kc-modal-speed': Math.max(0, speed) } as CSSProperties}
      onClick={(event) => {
        if (open && closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialog} className="kc-modal" tabIndex={-1}>
        <h2 className="kc-modal-title">{title}</h2>
        <div className="kc-modal-body">{children}</div>
        {actions == null ? null : <div className="kc-modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps extends Omit<ModalProps, 'children' | 'actions' | 'onClose'> {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  message, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel, danger = false, ...modal
}: ConfirmDialogProps) {
  return (
    <Modal {...modal} onClose={onCancel} actions={
      <>
        <button type="button" className="kc-modal-button" onClick={onCancel}>{cancelLabel}</button>
        <button
          type="button"
          className={danger ? 'kc-modal-button kc-modal-danger' : 'kc-modal-button kc-modal-confirm'}
          onClick={onConfirm}
          data-autofocus
        >
          {confirmLabel}
        </button>
      </>
    }>
      {message}
    </Modal>
  );
}
