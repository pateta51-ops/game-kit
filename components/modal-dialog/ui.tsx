import { useEffect, useEffectEvent, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { activeOverlay, isActiveElement } from '../ui-helpers/promptKeys.ts';
import './modal-dialog.css';

const FOCUSABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], [contenteditable]';
const MODAL = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]';
const keyboardOwner = (): Element | null => {
  const active = activeOverlay(document) as Element | null;
  return active?.closest(MODAL) ?? active;
};
const editable = (element: Element | null): boolean => {
  for (let at = element; at; at = at.parentElement) {
    const value = at.getAttribute('contenteditable')?.toLowerCase();
    if (value === 'false') return false;
    if (value === '' || value === 'true' || value === 'plaintext-only') return true;
  }
  return false;
};
const tabStop = (el: HTMLElement): boolean => {
  if (el.matches(':disabled') || !isActiveElement(el)) return false;
  if (el.hasAttribute('tabindex') || el.matches('a[href], button, input, select, textarea')) return el.tabIndex >= 0;
  return editable(el) && !editable(el.parentElement);
};
const tabRank = (el: HTMLElement): number => el.tabIndex > 0 ? el.tabIndex : Number.MAX_SAFE_INTEGER;
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
  const titleId = useId();
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const panel = dialog.current;
    if (!open || !panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openCount++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    const controls = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(tabStop)
      .sort((a, b) => tabRank(a) - tabRank(b));
    const preferred = Array.from(panel.querySelectorAll<HTMLElement>('[data-autofocus]')).some((el) => {
      if (el.matches(':disabled') || !isActiveElement(el)) return false;
      el.focus({ preventScroll: true });
      return document.activeElement === el;
    });
    if (!preferred) (controls()[0] ?? panel).focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || keyboardOwner() !== panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        const items = controls(), at = document.activeElement;
        const backwards = event.shiftKey;
        const start = (backwards ? items.at(-1) : items[0]) ?? panel;
        const index = at instanceof HTMLElement ? items.indexOf(at) : -1;
        const ordered = (items[0]?.tabIndex ?? 0) > 0;
        let next: HTMLElement | undefined;
        if (at === null || at === panel || !panel.contains(at)) next = start;
        else if (index < 0) {
          const relation = backwards ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
          const nearby = (backwards ? items.toReversed() : items)
            .find((el) => el.tabIndex <= 0 && (at.compareDocumentPosition(el) & relation) !== 0);
          if (ordered || !nearby) next = nearby ?? start;
        } else {
          next = items[index + (backwards ? -1 : 1)];
          if (next === undefined) next = start;
          else if (!ordered) return;
        }
        if (next) {
          event.preventDefault();
          next.focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (--openCount === 0) document.body.style.overflow = previousOverflow;
      const front = keyboardOwner();
      if (opener?.isConnected && (!front || front.contains(opener))) opener.focus({ preventScroll: true });
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
      <div ref={dialog} className="kc-modal" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 className="kc-modal-title" id={titleId}>{title}</h2>
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
