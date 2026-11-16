import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { KernelOption } from '../engine-core/index';
import { BoardBar, defaultLook, Order, PickAmount, PickOptions, PromptHost, useBoardPick, type Answer, type Kinded, type Look, type WidgetProps, type Widgets } from './ui';

type P = Kinded & { readonly kind: 'k' | 'j' };
const opts = (...ids: string[]): KernelOption[] => ids.map((id) => ({ id, enabled: !id.startsWith('-'), ...(id.startsWith('-') ? { why: 'Barred here' } : {}) }));
const pr = (options: KernelOption[], min = 1, max = 1, id = 1): P => ({ id, kind: 'k', options, min, max });
const look = defaultLook as Look<P>;
const opt = (id: string): HTMLElement => document.querySelector(`[data-option="${id}"]`)!;
const done = (): HTMLElement => screen.getByRole('button', { name: 'Done' });

// @ts-expect-error a kind the prompt type does not have fails to compile in the registry literal
const UNKNOWN: Widgets<P, null> = { k: PickOptions, j: PickOptions, z: PickOptions };
void UNKNOWN;

describe('widgets (K123 review)', () => {
  it('K226: options carry data-shortcut 1-9 (bindPromptKeys) and data-picked once one is picked (picked-state)', () => {
    render(<PickOptions prompt={pr(opts('a', 'b', 'c'), 1, 2)} view={null} answer={vi.fn<Answer>()} look={look} />);
    expect(opt('b')).toHaveAttribute('data-shortcut', '2');
    expect(opt('a')).not.toHaveAttribute('data-picked');
    fireEvent.click(document.querySelector<HTMLElement>('[data-shortcut="1"]')!);
    expect(opt('a')).toHaveAttribute('data-picked', 'picked');
    expect(opt('c')).toHaveAttribute('data-picked', 'unpicked');
  });

  it('PickOptions: min = max = 1 answers on the click; with confirm it waits for Done', () => {
    const a = vi.fn<Answer>();
    const { unmount } = render(<PickOptions prompt={pr(opts('a', 'b'))} view={null} answer={a} look={look} />);
    fireEvent.click(opt('b'));
    expect(a).toHaveBeenCalledWith(['b']);
    unmount();
    const c = vi.fn<Answer>();
    render(<PickOptions prompt={pr(opts('a', 'b'))} view={null} answer={c} look={look} confirm />);
    fireEvent.click(opt('a'));
    expect(c).not.toHaveBeenCalled();
    fireEvent.click(done());
    expect(c).toHaveBeenCalledWith(['a']);
  });

  it('PickOptions: picks stop at max', () => {
    const a = vi.fn<Answer>();
    render(<PickOptions prompt={pr(opts('a', 'b', 'c'), 1, 2)} view={null} answer={a} look={look} />);
    for (const id of ['a', 'b', 'c']) fireEvent.click(opt(id));
    expect(opt('c')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(done());
    expect(a).toHaveBeenCalledWith(['a', 'b']);
  });

  it('Order: barred options never join; with max below the legal count the answer is the clicks, min..max', () => {
    const a = vi.fn<Answer>();
    render(<Order prompt={pr(opts('x', 'y', '-z', 'w'), 2, 2)} view={null} answer={a} look={look} />);
    fireEvent.click(opt('-z'));
    expect(done()).toBeDisabled();
    fireEvent.click(opt('w'));
    expect(done()).toBeDisabled();
    fireEvent.click(opt('x'));
    fireEvent.click(opt('y'));
    expect(opt('y')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(done());
    expect(a).toHaveBeenCalledWith(['w', 'x']);
  });

  it('Order: all legal fit: the rest follow, barred left out', () => {
    const a = vi.fn<Answer>();
    render(<Order prompt={pr(opts('x', '-z', 'y'), 2, 3)} view={null} answer={a} look={look} />);
    fireEvent.click(opt('y'));
    fireEvent.click(done());
    expect(a).toHaveBeenCalledWith(['y', 'x']);
  });

  it('PickAmount: a number start, a barred amount says why and cannot be sent', () => {
    const a = vi.fn<Answer>();
    render(<PickAmount prompt={pr(opts('0', '-1', '2'))} view={null} answer={a} look={look} start={1} />);
    expect(done()).toBeDisabled();
    expect(screen.getByText('Barred here')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+' }));
    fireEvent.click(done());
    expect(a).toHaveBeenCalledWith(['2']);
  });

  it('idle words, title and look overrides', () => {
    const p = pr([{ id: 'a', enabled: true, idle: 'Changes nothing now' }, ...opts('b')], 1, 2);
    render(
      <PromptHost<P, null>
        widgets={{ k: PickOptions, j: PickOptions }}
        prompt={p}
        view={null}
        answer={() => undefined}
        title={() => 'Discard up to two cards.'}
        look={{ cls: (x) => `g-${x}`, label: (o) => `Card ${o.id}`, done: 'Finish', text: (s) => s.toUpperCase() }}
      />,
    );
    expect(screen.getByRole('heading')).toHaveTextContent('Discard up to two cards.');
    expect(opt('a')).toHaveClass('g-option');
    expect(opt('a')).toHaveTextContent('Card a');
    expect(screen.getByText('CHANGES NOTHING NOW')).toHaveClass('g-idle');
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
  });

  it('no auto-answer for another seat', () => {
    const a = vi.fn<Answer>();
    const auto = vi.fn(() => ['a']);
    render(<PromptHost<P, null> widgets={{ k: PickOptions, j: PickOptions }} prompt={pr(opts('a'))} view={null} answer={a} mine={false} auto={auto} />);
    expect(auto).not.toHaveBeenCalled();
    expect(a).not.toHaveBeenCalled();
  });

  it('auto sends once per prompt across re-renders; refused, the widget shows', async () => {
    const a = vi.fn<Answer>();
    const props = { widgets: { k: PickOptions, j: PickOptions }, view: null, answer: a, auto: () => ['a'] } as const;
    const { rerender } = render(<PromptHost<P, null> {...props} prompt={pr(opts('a', 'b'))} />);
    rerender(<PromptHost<P, null> {...props} prompt={pr(opts('a', 'b'))} />);
    expect(await screen.findByTestId('prompt')).toBeInTheDocument();
    rerender(<PromptHost<P, null> {...props} prompt={pr(opts('a', 'b'))} />);
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(['a'], 1);
  });

  it('answers carry the prompt id; a late answer from an old prompt is dropped', () => {
    const a = vi.fn<Answer>();
    let old: Answer = () => undefined;
    const Keep = ({ answer }: WidgetProps<P, null>) => {
      old = answer;
      return null;
    };
    const { rerender } = render(<PromptHost<P, null> widgets={{ k: Keep, j: Keep }} prompt={pr(opts('a'), 1, 1, 1)} view={null} answer={a} />);
    const first = old;
    first(['a']);
    expect(a).toHaveBeenLastCalledWith(['a'], 1);
    rerender(<PromptHost<P, null> widgets={{ k: Keep, j: Keep }} prompt={pr(opts('b'), 1, 1, 2)} view={null} answer={a} />);
    first(['a']);
    expect(a).toHaveBeenCalledTimes(1);
    old(['b']);
    expect(a).toHaveBeenLastCalledWith(['b'], 2);
  });
});

function Board({ prompt, answer, confirm = true }: { prompt: P; answer: Answer; confirm?: boolean }) {
  const pick = useBoardPick(prompt, answer, { confirm });
  return (
    <div>
      {prompt.options.map((o) => (
        <i key={o.id} data-testid={`space-${o.id}`} data-mark={pick.marks[o.id]} onClick={() => pick.tap(o.id)} />
      ))}
      <BoardBar pick={pick} prompt={prompt} look={look} hint={<p>Tap a highlighted space</p>} />
    </div>
  );
}

describe('board pick (K123, UFS tap to confirm)', () => {
  const space = (id: string): HTMLElement => screen.getByTestId(`space-${id}`);
  it('marks, tap to preview, a second tap, Confirm or Enter answers; Cancel and Escape disarm', () => {
    const a = vi.fn<Answer>();
    render(<Board prompt={pr(opts('a', 'b', '-c'), 1, 1, 7)} answer={a} />);
    expect(space('a')).toHaveAttribute('data-mark', 'legal');
    expect(space('-c')).toHaveAttribute('data-mark', 'barred');
    expect(screen.getByText('Tap a highlighted space')).toBeInTheDocument();
    fireEvent.click(space('-c'));
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    fireEvent.click(space('a'));
    expect(space('a')).toHaveAttribute('data-mark', 'armed');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(space('a')).toHaveAttribute('data-mark', 'legal');
    fireEvent.click(space('b'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(space('b')).toHaveAttribute('data-mark', 'legal');
    fireEvent.click(space('b'));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(a).toHaveBeenLastCalledWith(['b'], 7);
    fireEvent.click(space('a'));
    fireEvent.click(space('a'));
    expect(a).toHaveBeenLastCalledWith(['a'], 7);
    fireEvent.click(space('b'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(a).toHaveBeenCalledTimes(3);
  });

  it('K226: max > 1 picks several; a tap toggles, Confirm answers once min are picked; confirm: false answers at max', () => {
    const a = vi.fn<Answer>();
    const { unmount } = render(<Board prompt={pr(opts('a', 'b', 'c', '-d'), 2, 2, 9)} answer={a} />);
    fireEvent.click(space('a'));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    fireEvent.click(space('b'));
    fireEvent.click(space('c'));
    expect(space('c')).toHaveAttribute('data-mark', 'legal');
    fireEvent.click(space('a'));
    expect(space('a')).toHaveAttribute('data-mark', 'legal');
    fireEvent.click(space('c'));
    expect(space('b')).toHaveAttribute('data-mark', 'armed');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(a).toHaveBeenCalledWith(['b', 'c'], 9);
    unmount();
    const q = vi.fn<Answer>();
    render(<Board prompt={pr(opts('a', 'b', 'c'), 1, 2, 3)} answer={q} confirm={false} />);
    fireEvent.click(space('c'));
    expect(q).not.toHaveBeenCalled();
    fireEvent.click(space('a'));
    expect(q).toHaveBeenCalledWith(['c', 'a'], 3);
  });

  it('confirm: false answers on the first tap', () => {
    const a = vi.fn<Answer>();
    render(<Board prompt={pr(opts('a'))} answer={a} confirm={false} />);
    fireEvent.click(space('a'));
    expect(a).toHaveBeenCalledWith(['a'], 1);
  });
});
