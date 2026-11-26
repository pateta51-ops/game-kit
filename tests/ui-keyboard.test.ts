// @vitest-environment jsdom
import './setup-dom.ts';
import { createElement, type KeyboardEvent as ReactKeyEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../components/modal-dialog/ui.tsx';
import { Sheet } from '../components/phone-mode/ui.ts';
import { useBoardPick } from '../components/prompt-host/ui.ts';
import { bindPlayKeys, bindPromptKeys } from '../components/ui-helpers/index.ts';

const prompt = { id: 3, kind: 'pick', min: 1, max: 1, options: [{ id: 'north', enabled: true }] };
const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); });

function Board({ answer }: { answer: (picks: readonly string[], id?: number) => void }) {
  const pick = useBoardPick(prompt, answer);
  return createElement('div', { id: 'board' },
    createElement('button', { onClick: () => pick.tap('north') }, 'Arm north'),
    createElement('output', null, pick.armed ?? 'No pick'),
    createElement('input', { 'aria-label': 'Game text' }));
}

describe('composed gameplay keyboard ownership', () => {
  it.each(['Modal', 'Sheet'])('lets a focused child consume Escape before closing its %s', (kind) => {
    const close = vi.fn(), childKey = vi.fn();
    const child = createElement('input', { 'aria-label': 'Search choices', onKeyDown: (event: ReactKeyEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') { childKey(); event.preventDefault(); }
    } });
    render(kind === 'Modal'
      ? createElement(Modal, { open: true, title: 'Choices', onClose: close, children: child })
      : createElement(Sheet, { title: 'Choices', slideMs: 0, onClose: close, children: child }));
    const input = screen.getByRole('textbox', { name: 'Search choices' });
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    expect(childKey).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Choices' }), { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('leaves a child-owned Tab in the focused modal editor', () => {
    const childKey = vi.fn();
    render(createElement(Modal, { open: true, title: 'Edit choices', onClose: vi.fn(), children: [
      createElement('button', { key: 'first' }, 'First control'),
      createElement('textarea', { key: 'editor', 'aria-label': 'Choice editor', onKeyDown: (event: ReactKeyEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Tab') { childKey(); event.preventDefault(); }
      } }),
    ] }));
    const editor = screen.getByRole('textbox', { name: 'Choice editor' });
    editor.focus();
    fireEvent.keyDown(editor, { key: 'Tab' });
    expect(childKey).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(editor);
  });

  it.each([['Modal', 'Escape'], ['Modal', 'Tab'], ['Sheet', 'Escape'], ['Sheet', 'Tab']] as const)(
    'keeps %s %s inside the overlay before ancestor and earlier document shortcuts', (kind, key) => {
      const background = vi.fn(), ancestor = vi.fn(), close = vi.fn(), childKey = vi.fn();
      document.addEventListener('keydown', background);
      stops.push(() => document.removeEventListener('keydown', background));
      let consumed = false;
      const child = createElement('button', { onKeyDown: (event: ReactKeyEvent<HTMLButtonElement>) => {
        childKey();
        if (consumed) event.preventDefault();
      } }, 'Boundary action');
      const overlay = kind === 'Modal'
        ? createElement(Modal, { open: true, title: 'Boundary', onClose: close, children: child })
        : createElement(Sheet, { title: 'Boundary', slideMs: 0, onClose: close, children: child });
      render(createElement('div', { onKeyDown: ancestor }, overlay));
      const action = screen.getByRole('button', { name: 'Boundary action' });
      for (const own of [false, true]) {
        consumed = own;
        close.mockClear();
        childKey.mockClear();
        action.focus();
        fireEvent.keyDown(action, { key });
        expect(childKey).toHaveBeenCalledTimes(1);
        expect(ancestor).not.toHaveBeenCalled();
        expect(background).not.toHaveBeenCalled();
        expect(close).toHaveBeenCalledTimes(key === 'Escape' && !own ? 1 : 0);
      }
    },
  );

  it('blocks gameplay under an open Modal, then restores keys when the mounted dialog closes', () => {
    const numbered = vi.fn(), end = vi.fn(), answer = vi.fn(), clear = vi.fn(), close = vi.fn();
    const scene = (open: boolean) => createElement('div', null,
      createElement('div', { id: 'prompt' }, createElement('button', { 'data-shortcut': 1, onClick: numbered }, 'Numbered action')),
      createElement(Board, { answer }),
      createElement(Modal, { open, title: 'Review move', onClose: close, children: createElement('input', { 'aria-label': 'Dialog text' }) }));
    const { rerender } = render(scene(false));
    stops.push(bindPromptKeys(document, { open: () => true, panel: () => document.querySelector('#prompt'), clear: () => { clear(); return true; } }));
    stops.push(bindPlayKeys(document, { board: { e: end } }));
    fireEvent.click(screen.getByRole('button', { name: 'Arm north' }));
    rerender(scene(true));
    for (const key of ['1', 'e', 'Enter']) fireEvent.keyDown(document.body, { key });
    expect(numbered).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Dialog text' }), { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    expect(screen.getByText('north')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Review move' })).toHaveAttribute('aria-modal', 'true');
    rerender(scene(false));
    fireEvent.keyDown(document.body, { key: '1' });
    fireEvent.keyDown(document.body, { key: 'e' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(numbered).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledExactlyOnceWith(['north'], 3);
  });

  it('ignores inactive custom dialogs and still finds an active one after them', () => {
    const end = vi.fn();
    const hidden = document.createElement('div');
    hidden.hidden = true;
    hidden.innerHTML = '<div role="dialog">Closed</div>';
    document.body.append(hidden);
    const visible = document.createElement('div');
    visible.setAttribute('role', 'dialog');
    document.body.append(visible);
    const stop = bindPlayKeys(document, { board: { e: end } });
    try {
      fireEvent.keyDown(document.body, { key: 'e' });
      expect(end).not.toHaveBeenCalled();
      for (const inactive of ['hidden', 'inert', 'aria-hidden', 'style']) {
        if (inactive === 'style') visible.style.display = 'none';
        else visible.setAttribute(inactive, inactive === 'aria-hidden' ? 'true' : '');
        fireEvent.keyDown(document.body, { key: 'e' });
        expect(end).toHaveBeenCalledTimes(1);
        end.mockClear();
        visible.removeAttribute(inactive);
      }
    } finally { stop(); hidden.remove(); visible.remove(); }
  });

  it('leaves an armed pick unchanged while typing or when another handler owns the event', () => {
    const answer = vi.fn();
    render(createElement(Board, { answer }));
    fireEvent.click(screen.getByRole('button', { name: 'Arm north' }));
    const input = screen.getByRole('textbox', { name: 'Game text' });
    for (const key of ['Enter', 'Escape']) fireEvent.keyDown(input, { key });
    for (const key of ['Enter', 'Escape']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      event.preventDefault();
      window.dispatchEvent(event);
    }
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Enter', repeat: true });
    expect(answer).not.toHaveBeenCalled();
    expect(screen.getByText('north')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('No pick')).toBeTruthy();
  });

  it('gives Escape to the topmost active overlay across Sheet and Modal', () => {
    const sheetClose = vi.fn(), modalClose = vi.fn();
    const scene = (open: boolean) => createElement('div', null,
      createElement(Sheet, { title: 'Sheet', onClose: sheetClose, children: 'Sheet content' }),
      createElement(Modal, { open, title: 'Modal', onClose: modalClose, children: 'Modal content' }));
    const { rerender } = render(scene(false));
    rerender(scene(true));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(modalClose).toHaveBeenCalledTimes(1);
    expect(sheetClose).not.toHaveBeenCalled();
    rerender(scene(false));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(sheetClose).toHaveBeenCalledTimes(1);
  });
});
