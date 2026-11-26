import { useEffect, useEffectEvent, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { activeModal, isActiveElement } from '../ui-helpers/promptKeys.ts';
import './modal-dialog.css';

const NATIVE_SUBTREE = 'iframe, audio[controls], video[controls]';
const FOCUSABLE =
  `a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable], ${NATIVE_SUBTREE}`;
const tabGuardStyle = { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' } as const;
const editable = (element: Element | null): boolean => {
  for (let at = element; at; at = at.parentElement) {
    const value = at.getAttribute('contenteditable')?.toLowerCase();
    if (value === 'false') return false;
    if (value === '' || value === 'true' || value === 'plaintext-only') return true;
  }
  return false;
};
const available = (el: HTMLElement): boolean => {
  if (el.matches(':disabled') || !isActiveElement(el)) return false;
  for (let details = el.parentElement?.closest('details:not([open])'); details;
    details = details.parentElement?.closest('details:not([open])')) {
    if (!details.querySelector(':scope > summary')?.contains(el)) return false;
  }
  return true;
};
const tabStop = (el: HTMLElement): boolean => {
  if (!available(el)) return false;
  if (el.hasAttribute('tabindex') || el.matches('a[href], button, input, select, textarea')) return el.tabIndex >= 0;
  if (el.matches(NATIVE_SUBTREE)) return true;
  if (el.matches('details > summary') && el.parentElement?.querySelector(':scope > summary') === el) return true;
  return editable(el) && !editable(el.parentElement);
};
const tabRank = (el: HTMLElement): number => el.tabIndex > 0 ? el.tabIndex : Number.MAX_SAFE_INTEGER;
const namedRadio = (el: Element | null): el is HTMLInputElement =>
  el instanceof HTMLInputElement && el.type === 'radio' && el.name !== '';
const sameGroup = (a: HTMLInputElement, b: Element | null): boolean =>
  namedRadio(b) && a.name === b.name && a.form === b.form;
function tabOrder(panel: HTMLElement, backwards = false): HTMLElement[] {
  const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(tabStop);
  const radios = items.filter(namedRadio);
  const checked = Array.from(panel.ownerDocument.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked'));
  return items.filter((el) => {
    if (!namedRadio(el)) return true;
    const selected = checked.find((radio) => sameGroup(el, radio));
    if (selected) return selected === el;
    const group = radios.filter((radio) => sameGroup(el, radio));
    return el === (backwards ? group.at(-1) : group[0]);
  }).sort((a, b) => tabRank(a) - tabRank(b));
}
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
  const wrap = (backwards: boolean) => {
    const panel = dialog.current;
    if (!panel || activeModal(document) !== panel) return;
    const items = tabOrder(panel, backwards);
    ((backwards ? items.at(-1) : items[0]) ?? panel).focus();
  };

  useEffect(() => {
    const panel = dialog.current;
    if (!open || !panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openCount++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    const preferred = Array.from(panel.querySelectorAll<HTMLElement>('[data-autofocus]')).some((el) => {
      if (!available(el)) return false;
      el.focus({ preventScroll: true });
      return document.activeElement === el;
    });
    if (!preferred) (tabOrder(panel)[0] ?? panel).focus({ preventScroll: true });

    const frameGuards = new Map<HTMLIFrameElement, [HTMLSpanElement, HTMLSpanElement]>();
    let enteringFrame = false;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || activeModal(document) !== panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        const backwards = event.shiftKey;
        const items = tabOrder(panel, backwards), at = document.activeElement;
        if (at?.matches(NATIVE_SUBTREE)) return;
        const start = (backwards ? items.at(-1) : items[0]) ?? panel;
        const index = items.findIndex((el) => el === at || (namedRadio(el) && sameGroup(el, at)));
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
          const guards = frameGuards.get(next as HTMLIFrameElement);
          if (guards) {
            enteringFrame = true;
            guards[backwards ? 1 : 0].focus();
            enteringFrame = false;
            return;
          }
          event.preventDefault();
          next.focus();
        }
      }
    };
    const onFrameKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onKey(event);
    };
    const frameDocuments = new Map<HTMLIFrameElement, Document>();
    const syncFrames = () => {
      const frames = new Set(panel.querySelectorAll('iframe'));
      for (const [frame, guards] of frameGuards) {
        if (frames.has(frame) && frame.tabIndex > 0 && tabStop(frame)) continue;
        for (const guard of guards) guard.remove();
        frameGuards.delete(frame);
      }
      for (const [frame, frameDocument] of frameDocuments) {
        if (frames.has(frame) && frame.contentDocument === frameDocument) continue;
        frameDocument.removeEventListener('keydown', onFrameKey, true);
        frameDocuments.delete(frame);
      }
      for (const frame of frames) {
        if (frame.tabIndex > 0 && tabStop(frame)) {
          const makeGuard = (backwards: boolean) => {
            const guard = document.createElement('span');
            Object.assign(guard.style, tabGuardStyle);
            guard.setAttribute('aria-hidden', 'true');
            guard.addEventListener('focus', () => {
              if (enteringFrame || activeModal(document) !== panel) return;
              const items = tabOrder(panel, backwards);
              const next = items[items.indexOf(frame) + (backwards ? -1 : 1)];
              (next ?? (backwards ? items.at(-1) : items[0]) ?? panel).focus();
            });
            return guard;
          };
          const guards = frameGuards.get(frame) ?? [makeGuard(true), makeGuard(false)];
          frameGuards.set(frame, guards);
          for (const guard of guards) if (guard.tabIndex !== frame.tabIndex) guard.tabIndex = frame.tabIndex;
          if (frame.previousSibling !== guards[0]) frame.before(guards[0]);
          if (frame.nextSibling !== guards[1]) frame.after(guards[1]);
        }
        if (frameDocuments.has(frame)) continue;
        const frameDocument = frame.contentDocument;
        if (!frameDocument) continue;
        frameDocument.addEventListener('keydown', onFrameKey, true);
        frameDocuments.set(frame, frameDocument);
      }
    };
    const onFrameLoad = (event: Event) => {
      if (event.target instanceof HTMLIFrameElement) syncFrames();
    };
    const frameObserver = new MutationObserver(syncFrames);
    frameObserver.observe(panel, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['tabindex', 'hidden', 'inert', 'aria-hidden', 'open', 'style', 'class'] });
    panel.addEventListener('load', onFrameLoad, true);
    syncFrames();
    document.addEventListener('keydown', onKey, true);
    return () => {
      frameObserver.disconnect();
      for (const guards of frameGuards.values()) for (const guard of guards) guard.remove();
      panel.removeEventListener('load', onFrameLoad, true);
      for (const frameDocument of frameDocuments.values()) frameDocument.removeEventListener('keydown', onFrameKey, true);
      document.removeEventListener('keydown', onKey, true);
      if (--openCount === 0) document.body.style.overflow = previousOverflow;
      const front = activeModal(document) as Element | null;
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
        <span tabIndex={0} aria-hidden="true" style={tabGuardStyle} onFocus={() => wrap(true)} />
        <h2 className="kc-modal-title" id={titleId}>{title}</h2>
        <div className="kc-modal-body">{children}</div>
        {actions == null ? null : <div className="kc-modal-actions">{actions}</div>}
        <span tabIndex={0} aria-hidden="true" style={tabGuardStyle} onFocus={() => wrap(false)} />
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
