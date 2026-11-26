import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Board } from './fake/Board.tsx';
import { Modal } from './ui.tsx';

function open(label: string) {
  const button = screen.getByRole('button', { name: label });
  button.focus();
  fireEvent.click(button);
  return button;
}

describe('modal-dialog', () => {
  afterEach(() => {
    document.body.style.removeProperty('overflow');
    vi.restoreAllMocks();
  });

  it.each(['top', 'bottom'])('keeps scrolling locked when the %s dialog closes first', (first) => {
    document.body.style.overflow = 'scroll';
    const closeBottom = vi.fn();
    const closeTop = vi.fn();
    const dialogs = (bottom: boolean, top: boolean) => <>
      <Modal open={bottom} onClose={closeBottom} title="Bottom">Bottom content</Modal>
      <Modal open={top} onClose={closeTop} title="Top">Top content</Modal>
    </>;
    const { rerender } = render(dialogs(true, false));
    rerender(dialogs(true, true));
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();

    rerender(dialogs(first === 'top', first === 'bottom'));
    expect(document.body.style.overflow).toBe('hidden');
    rerender(dialogs(false, false));
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('sets zero transition speed and toggles visibility immediately', () => {
    const onClose = vi.fn();
    const dialog = (isOpen: boolean) => <Modal open={isOpen} onClose={onClose} title="Instant" speed={0}>Content</Modal>;
    const { rerender } = render(dialog(false));
    const backdrop = screen.getByText('Instant').closest('.kc-modal-backdrop');
    expect(backdrop).toHaveAttribute('hidden');

    rerender(dialog(true));
    expect(backdrop).toHaveStyle({ '--kc-modal-speed': '0' });
    expect(backdrop).not.toHaveAttribute('hidden');

    rerender(dialog(false));
    expect(backdrop).toHaveStyle({ '--kc-modal-speed': '0' });
    expect(backdrop).toHaveAttribute('hidden');
  });

  it('returns nested focus to its opener without stealing focus when the lower dialog closes', () => {
    const dialogs = (bottom: boolean, top: boolean) => <>
      <Modal open={bottom} onClose={vi.fn()} title="Bottom"><button>Nested opener</button></Modal>
      <Modal open={top} onClose={vi.fn()} title="Top"><button>Top action</button></Modal>
    </>;
    const { rerender } = render(dialogs(true, false));
    const opener = screen.getByRole('button', { name: 'Nested opener' });
    opener.focus();
    rerender(dialogs(true, true));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Top action' }));
    rerender(dialogs(true, false));
    expect(document.activeElement).toBe(opener);
    rerender(dialogs(true, true));
    const top = screen.getByRole('button', { name: 'Top action' });
    rerender(dialogs(false, true));
    expect(document.activeElement).toBe(top);
  });

  it('names the active dialog and wraps Tab around its enabled visible controls', () => {
    render(<Modal open title="Review" onClose={vi.fn()}>
      <button>First</button><button disabled>Disabled</button><button hidden>Hidden</button><button>Last</button>
    </Modal>);
    const panel = screen.getByRole('dialog', { name: 'Review' });
    expect(panel).toHaveAttribute('aria-modal', 'true');
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    document.body.focus();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('ignores controls disabled by a fieldset while preserving its first legend exception', () => {
    const { rerender } = render(<Modal open title="Review" onClose={vi.fn()}>
      <fieldset disabled><button data-autofocus>Unavailable</button></fieldset>
      <button>Continue</button>
    </Modal>);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Continue' }));
    rerender(<Modal open title="Review" onClose={vi.fn()}>
      <fieldset disabled>
        <legend><button>Legend action</button></legend><button>Unavailable</button>
        <legend><button>Second legend unavailable</button></legend>
      </fieldset>
      <button>Continue</button>
    </Modal>);
    const next = screen.getByRole('button', { name: 'Continue' });
    const legend = screen.getByRole('button', { name: 'Legend action' });
    next.focus();
    fireEvent.keyDown(next, { key: 'Tab' });
    expect(document.activeElement).toBe(legend);
    fireEvent.keyDown(legend, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(next);
  });

  it('leaves native Tab traversal into an editable region available', () => {
    const { rerender } = render(<Modal open title="Review" onClose={vi.fn()}>
      <button>First</button>
      <div contentEditable suppressContentEditableWarning>Editable note</div>
    </Modal>);
    const first = screen.getByRole('button', { name: 'First' });
    first.focus();
    expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(true);
    rerender(<Modal open title="Review" onClose={vi.fn()}>
      <button>First</button>
      <div contentEditable tabIndex={-1} suppressContentEditableWarning>Editable note</div>
    </Modal>);
    expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(first);
  });

  it('restores overflow and focus and removes the Escape listener when unmounted open', () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    document.body.style.overflow = 'auto';
    render(<button type="button">Open dialog</button>);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = render(<Modal open onClose={onClose} title="Temporary">
      <button type="button">Dialog action</button>
    </Modal>);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dialog action' }));
    expect(document.body.style.overflow).toBe('hidden');
    const keyListener = addListener.mock.calls.find(([type, , capture]) => type === 'keydown' && capture === true);
    expect(keyListener).toBeDefined();

    unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.activeElement).toBe(opener);
    expect(removeListener.mock.calls).toContainEqual(keyListener);
    fireEvent.keyDown(opener, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('portals to body, moves focus, locks scrolling and restores both on Escape', () => {
    const { container } = render(<Board />);
    const opener = open('Turn summary');
    const action = screen.getByRole('button', { name: 'Back to board' });
    expect(container.contains(action)).toBe(false);
    expect(action.closest('.kc-modal-backdrop')?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(action);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(action, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Back to board' })).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('dismisses on a backdrop click only when enabled', () => {
    const { rerender } = render(<Board />);
    const opener = open('Turn summary');
    const panel = screen.getByText('You played 3 moves this turn.');
    const backdrop = panel.closest('.kc-modal-backdrop') as HTMLElement;
    fireEvent.click(panel);
    expect(backdrop.hidden).toBe(false);

    rerender(<Board closeOnBackdrop={false} />);
    fireEvent.click(backdrop);
    expect(backdrop.hidden).toBe(false);

    rerender(<Board />);
    fireEvent.click(backdrop);
    expect(backdrop.hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('cancels without resetting and confirms a reset on the next open', () => {
    render(<Board />);
    const opener = open('Reset board');
    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }));
    expect(screen.getByText('Moves played: 3')).toBeTruthy();
    expect(document.activeElement).toBe(opener);

    open('Reset board');
    const confirm = screen.getByRole('button', { name: 'Reset moves' });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(screen.getByText('Moves played: 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset moves' })).toBeNull();

    open('Reset board');
    fireEvent.click(screen.getByRole('button', { name: 'Reset moves' }));
    expect(screen.getByText('Moves played: 0')).toBeTruthy();
    expect(document.activeElement).toBe(opener);
  });
});
