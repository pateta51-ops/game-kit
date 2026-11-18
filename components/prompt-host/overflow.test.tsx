import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PickOptions, PromptHost, useOverflow, type OverflowOpts } from './ui.ts';

const layout = {
  floor: 28,
  frac: 0.5,
  stage: [600, 400],
  zone: [20, 40, 240, 100],
  keepOut: [],
  gap: 10,
} satisfies Omit<OverflowOpts, 'answers' | 'find' | 'ref'>;

function fakeLayout(height: (box: HTMLElement) => number) {
  const client = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return parseFloat(this.style.height) || 100;
  });
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return height(this);
  });
  return { client, scroll };
}

function Game({ id = 1, keepOut = layout.keepOut }: { id?: number; keepOut?: OverflowOpts['keepOut'] }) {
  useOverflow({ ...layout, answers: '.answers', find: () => document.querySelector<HTMLElement>('#prompt-box'), keepOut }, [id, keepOut]);
  return (
    <section id="prompt-box" data-testid="box" style={{ height: 100, position: 'relative' }}>
      <div className="answers" style={{ fontSize: '31.5px' }}>
        <button type="button">An answer</button>
      </div>
    </section>
  );
}

afterEach(() => vi.restoreAllMocks());

it('leaves a fitting prompt in its zone', () => {
  fakeLayout(() => 100);
  render(<Game />);
  expect(screen.getByTestId('box')).not.toHaveAttribute('data-overflow');
  expect(screen.getByRole('button').parentElement?.style.fontSize).toBe('31.5px');
});

it('shrinks by one pixel and clamps the final step to the floor', () => {
  const steps: string[] = [];
  fakeLayout((box) => {
    const font = box.querySelector<HTMLElement>('.answers')?.style.fontSize ?? '';
    steps.push(font);
    return font === '28px' ? 100 : 150;
  });
  render(<Game />);
  expect(steps).toEqual(['31.5px', '30.5px', '29.5px', '28.5px', '28px']);
  expect(screen.getByTestId('box')).not.toHaveAttribute('data-overflow');
});

it('uses two columns when they fit at the floor', () => {
  fakeLayout((box) => (box.dataset['overflow'] === 'cols' ? 100 : 240));
  render(<Game />);
  expect(screen.getByTestId('box')).toHaveAttribute('data-overflow', 'cols');
  expect(screen.getByTestId('box').style.overflowY).toBe('auto');
});

it.each([
  { keepOut: [], height: 200 },
  { keepOut: [[0, 10, 600, 20], [260, 100, 100, 50], [80, 210, 50, 40]] as const, height: 160 },
])('caps panel height at $height px', ({ keepOut, height }) => {
  fakeLayout(() => 300);
  render(<Game keepOut={keepOut} />);
  expect(screen.getByTestId('box')).toHaveAttribute('data-overflow', 'panel');
  expect(screen.getByTestId('box').style.height).toBe(`${String(height)}px`);
});

it('keeps columns when a keep-out leaves no room and tracks scroll in both directions', () => {
  fakeLayout(() => 300);
  render(<Game keepOut={[[20, 150, 240, 50]]} />);
  const box = screen.getByTestId('box');
  expect(box).toHaveAttribute('data-overflow', 'cols');
  expect(box).toHaveAttribute('data-more', '1');
  box.scrollTop = 200;
  fireEvent.scroll(box);
  expect(box).toHaveAttribute('data-more', '0');
  box.scrollTop = 15;
  fireEvent.scroll(box);
  expect(box).toHaveAttribute('data-more', '1');
});

it('restores the zone and existing inline styles when dependencies change', () => {
  const { scroll } = fakeLayout(() => 300);
  const { rerender } = render(<Game />);
  const box = screen.getByTestId('box');
  expect(box).toHaveAttribute('data-overflow', 'panel');
  scroll.mockReturnValue(100);
  rerender(<Game id={2} />);
  expect(box).not.toHaveAttribute('data-overflow');
  expect(box).not.toHaveAttribute('data-more');
  expect(box.style.height).toBe('100px');
  expect(box.style.position).toBe('relative');
  expect(screen.getByRole('button').parentElement?.style.fontSize).toBe('31.5px');
});

it('does not refit or reset scroll when the parent re-renders with an equal options literal', () => {
  fakeLayout(() => 300);
  const el = () => (
    <PromptHost
      widgets={{ pick: PickOptions }}
      prompt={{ id: 1, kind: 'pick', min: 1, max: 1, options: [{ id: 'a', enabled: true }] }}
      view={null}
      answer={() => undefined}
      look={{ label: (x) => x.id, done: 'Commit' }}
      overflow={{ ...layout }}
    />
  );
  const { rerender } = render(el());
  const box = screen.getByTestId('prompt');
  box.scrollTop = 40;
  rerender(el());
  expect(box.scrollTop).toBe(40);
});

it('checks the host again when answers are added and removed', async () => {
  fakeLayout((box) => (box.querySelectorAll('button').length > 1 ? 300 : 100));
  render(
    <PromptHost
      widgets={{ pick: PickOptions }}
      prompt={{ id: 1, kind: 'pick', min: 1, max: 1, options: [{ id: 'a', enabled: true }] }}
      view={null}
      answer={() => undefined}
      look={{ label: (o) => o.id, done: 'Commit' }}
      overflow={layout}
    />,
  );
  const box = screen.getByTestId('prompt');
  const answers = screen.getByRole('button').parentElement;
  expect(box).not.toHaveAttribute('data-overflow');
  const added = document.createElement('button');
  answers?.append(added);
  await waitFor(() => expect(box).toHaveAttribute('data-overflow', 'panel'));
  added.remove();
  await waitFor(() => expect(box).not.toHaveAttribute('data-overflow'));
});
