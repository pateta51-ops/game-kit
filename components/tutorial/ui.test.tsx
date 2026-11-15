import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CONTENT, COUNTER, RULES, type Counter } from '../engine-core/fake/counter';
import { lockAt, startRun, type TutorialGame, type TutorialScript } from './index';
import { TutorialHighlight, TutorialPanel } from './ui';

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
