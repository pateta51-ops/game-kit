import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CONTENT, COUNTER, RULES, type Counter } from '../engine-core/fake/counter.ts';
import { lockAt, startRun, type TutorialGame, type TutorialScript } from './index.ts';
import { TutorialHighlight, TutorialPanel, type TutorialButtonProps } from './ui.ts';

const GAME: TutorialGame<Counter> = { rules: COUNTER, content: CONTENT, gameRules: RULES, options: (seed) => ({ seed }), optionWords: (_s, id) => (id === 'add' ? 'Add' : id) };
const SCRIPT: TutorialScript = {
  seed: 'tut',
  steps: [
    { id: 'intro', narration: 'Reach the target.', targets: ['counter'], do: { kind: 'next' } },
    { id: 'add', narration: 'Add one.', targets: ['add'], do: { kind: 'move', choose: ['add'] } },
  ],
};
const state = startRun(GAME, 'tut').state;
const fns = () => ({ onNext: vi.fn(), onBack: vi.fn(), onLeave: vi.fn(), onClose: vi.fn() });

describe('TutorialPanel', () => {
  it('shows the step, Next on an explaining step, the asks on a move step', () => {
    const f = fns();
    const { rerender } = render(<TutorialPanel lock={lockAt(GAME, SCRIPT, 0, state)} phase="guided" title="First game" {...f} text={(s) => <i>{s}</i>} />);
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Reach the target.').tagName).toBe('I');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(f.onNext).toHaveBeenCalled();
    rerender(<TutorialPanel lock={lockAt(GAME, SCRIPT, 1, state)} phase="guided" {...f} />);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.getByText('Add')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText('Add one.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave tutorial' }));
    expect(f.onLeave).toHaveBeenCalled();
  });

  it('offers Close while closing and draws nothing when off', () => {
    const f = fns();
    const { rerender, container } = render(<TutorialPanel lock={lockAt(GAME, SCRIPT, 2, state)} phase="closing" {...f} words={{ close: 'Done' }} />);
    expect(screen.getByText('The tutorial is over. Play on, or close it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(f.onClose).toHaveBeenCalled();
    rerender(<TutorialPanel lock={lockAt(GAME, SCRIPT, 2, state)} phase="off" {...f} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('TutorialPanel side and button (K33)', () => {
  it('without side or button: no side attribute, nothing on <html>', () => {
    const { container } = render(<TutorialPanel lock={lockAt(GAME, SCRIPT, 0, state)} phase="guided" docked {...fns()} />);
    const panel = container.querySelector('[data-tutorial-panel]')!;
    expect(panel.hasAttribute('data-side')).toBe(false);
    expect(panel.hasAttribute('data-docked')).toBe(true);
    expect(document.documentElement.dataset['tutSide']).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue('--tut-reserve')).toBe('');
  });

  it('side: docked on that edge, the reserved space on <html> while it shows', () => {
    const size = (k: 'offsetWidth' | 'offsetHeight', v: number) => Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => v });
    const old = [Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!, Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!] as const;
    size('offsetWidth', 400);
    size('offsetHeight', 120);
    const root = document.documentElement;
    const f = fns();
    const { rerender, unmount, container } = render(<TutorialPanel lock={lockAt(GAME, SCRIPT, 0, state)} phase="guided" side="right" {...f} />);
    const panel = container.querySelector('[data-tutorial-panel]')!;
    expect(panel.getAttribute('data-side')).toBe('right');
    expect(panel.hasAttribute('data-docked')).toBe(true);
    expect(root.dataset['tutSide']).toBe('right');
    expect(root.style.getPropertyValue('--tut-reserve')).toBe('400px');
    rerender(<TutorialPanel lock={lockAt(GAME, SCRIPT, 0, state)} phase="guided" side="bottom" {...f} />);
    expect(root.dataset['tutSide']).toBe('bottom');
    expect(root.style.getPropertyValue('--tut-reserve')).toBe('120px');
    rerender(<TutorialPanel lock={lockAt(GAME, SCRIPT, 0, state)} phase="closed" side="bottom" {...f} />);
    expect(root.dataset['tutSide']).toBeUndefined();
    expect(root.style.getPropertyValue('--tut-reserve')).toBe('');
    rerender(<TutorialPanel lock={lockAt(GAME, SCRIPT, 0, state)} phase="guided" side="top" {...f} />);
    expect(root.dataset['tutSide']).toBe('top');
    unmount();
    expect(root.dataset['tutSide']).toBeUndefined();
    expect(root.style.getPropertyValue('--tut-reserve')).toBe('');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', old[0]);
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', old[1]);
  });

  it("button: every panel button is the game's own component", () => {
    const Plate = ({ kind, children, ...rest }: TutorialButtonProps) => (
      <button type="button" className="plate" data-kind={kind} {...rest}>
        {children}
      </button>
    );
    const f = fns();
    const { rerender, container } = render(<TutorialPanel lock={lockAt(GAME, SCRIPT, 0, state)} phase="guided" button={Plate} {...f} />);
    const kinds = () => [...container.querySelectorAll('button')].map((b) => `${b.className}:${String(b.dataset['kind'])}`);
    expect(kinds()).toEqual(['plate:fold', 'plate:back', 'plate:next', 'plate:leave']);
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(container.querySelector('[data-tutorial-next]')).toBe(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(f.onNext).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText('Reach the target.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave tutorial' }));
    expect(f.onLeave).toHaveBeenCalled();
    rerender(<TutorialPanel lock={lockAt(GAME, SCRIPT, 2, state)} phase="closing" button={Plate} {...f} />);
    expect(kinds()).toEqual(['plate:fold', 'plate:back', 'plate:close']);
    fireEvent.click(screen.getByRole('button', { name: 'Close tutorial' }));
    expect(f.onClose).toHaveBeenCalled();
  });
});

describe('TutorialHighlight', () => {
  const box = (el: HTMLElement, x: number, y: number, w: number, h: number) => {
    el.getBoundingClientRect = () => ({ left: x, top: y, width: w, height: h, x, y, right: x + w, bottom: y + h, toJSON: () => ({}) });
    el.getClientRects = () => [el.getBoundingClientRect()] as unknown as DOMRectList;
  };

  it('marks the targets, shades around them and places the panel clear of them', () => {
    Object.assign(window, { innerWidth: 1048, innerHeight: 848 });
    const f = fns();
    const { rerender, unmount } = render(
      <>
        <button data-tutorial-target="counter add">target</button>
        <TutorialPanel lock={lockAt(GAME, SCRIPT, 0, state)} phase="guided" {...f} />
      </>,
    );
    const target = screen.getByText('target');
    box(target, 424, 524, 100, 50);
    const panel = document.querySelector<HTMLElement>('[data-tutorial-panel]')!;
    Object.defineProperties(panel, { offsetWidth: { value: 300 }, offsetHeight: { value: 200 } });
    rerender(
      <>
        <button data-tutorial-target="counter add">target</button>
        <TutorialPanel lock={lockAt(GAME, SCRIPT, 0, state)} phase="guided" {...f} />
        <TutorialHighlight targets={['counter']} />
      </>,
    );
    expect(target).toHaveClass('kit-tutorial-target');
    expect(panel.style.top).toBe('284px');
    expect(panel.style.left).toBe('324px');
    const shade = document.querySelector('.kit-tutorial-shade')!;
    expect(shade.querySelectorAll('mask rect')).toHaveLength(3);
    expect(shade.querySelector('.kit-tutorial-leader')).not.toBeNull();
    unmount();
    expect(document.querySelector('.kit-tutorial-shade')).toBeNull();
    expect(target).not.toHaveClass('kit-tutorial-target');
  });

  it('its own shade does not set the watcher off again (the page froze)', async () => {
    const { getByText } = render(<button data-tutorial-target="add">t</button>);
    box(getByText('t'), 0, 0, 10, 10);
    const panel = document.createElement('div');
    document.body.append(panel);
    let n = 0;
    const { unmount } = render(<TutorialHighlight targets={['add']} panel={() => (++n > 20 ? null : panel)} />);
    document.body.append(document.createElement('p'));
    await new Promise((r) => setTimeout(r));
    expect(n).toBeLessThan(10);
    expect(document.querySelector('.kit-tutorial-shade mask')).not.toBeNull();
    unmount();
    panel.remove();
  });

  it('docked: no shade, the target scrolled into view', () => {
    const scroll = vi.fn();
    const { getByText } = render(<button data-tutorial-target="add">t</button>);
    const t = getByText('t');
    box(t, 0, 0, 10, 10);
    t.scrollIntoView = scroll;
    render(<TutorialHighlight targets={['add']} docked />);
    expect(document.querySelector('.kit-tutorial-shade')).toBeNull();
    expect(scroll).toHaveBeenCalled();
  });
});
