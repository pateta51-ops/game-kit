import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { checklist, countGames, evaluate, firstRun, makeSummary, toastFor, type AchievementDef } from './index';
import { AchievementList, AchievementToast, FeatCallout } from './ui';

describe('FeatCallout', () => {
  it('shows the text and a worded close button', () => {
    const f = vi.fn();
    render(<FeatCallout text="First defeat" onClose={f} words={{ ok: 'Fine' }} />);
    fireEvent.click(screen.getByText('Fine'));
    expect(screen.getByTestId('feat-callout')).toHaveTextContent('First defeat');
    expect(f).toHaveBeenCalled();
  });
});

const defs: AchievementDef[] = [
  { id: 'w1', name: 'First win', text: 'Win a game.', family: 'wins', points: 10, measure: countGames((x) => x.result === 'win', 1) },
  { id: 'all', name: 'Everyone', text: 'Win with a, b.', family: 'heroes', points: 30, checklist: ['a', 'b'], measure: checklist(['a', 'b'], (x) => x.sets['hero'] ?? []) },
];
const games = [makeSummary({ id: '1', at: 1, result: 'win', rounds: 3, counts: {}, sets: { hero: ['a'] } })];

describe('AchievementList', () => {
  it('groups by family, locked rows say how, progress shown, checklist ticked', () => {
    render(<AchievementList defs={defs} statuses={evaluate(defs, games)} />);
    expect(screen.getByTestId('ach-w1')).toHaveClass('kit-ach-earned');
    const all = screen.getByTestId('ach-all');
    expect(all).toHaveClass('kit-ach-locked');
    expect(all).toHaveTextContent('Win with a, b.');
    expect(all).toHaveTextContent('1 / 2');
    expect(all.querySelector('progress')).toHaveAttribute('value', '1');
    expect(all.querySelectorAll('.kit-ach-item-done')).toHaveLength(1);
    expect(screen.getByText(/1 \/ 1 · 10 pts/)).toBeInTheDocument();
  });
});

describe('toast', () => {
  it('stacks several earns into one counted toast; silent and off give none', () => {
    const t = toastFor(defs, ['w1', 'all']);
    expect(t).toMatchObject({ count: 2, name: 'First win', holdMs: 5000 });
    expect(toastFor(defs, ['w1'], { holdMs: 3000 })?.holdMs).toBe(3000);
    expect(toastFor(defs, ['w1'], { silent: true })).toBeNull();
    expect(toastFor(defs, ['w1'], { off: true })).toBeNull();
    expect(toastFor(defs, [])).toBeNull();
  });
  it('first run is true once', () => {
    const d: Record<string, string> = {};
    const st = { getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => void (d[k] = v) };
    expect([firstRun(st, 'k'), firstRun(st, 'k')]).toEqual([true, false]);
  });
  it('draws the count, or the name for one', () => {
    const close = vi.fn();
    const { rerender } = render(<AchievementToast toast={toastFor(defs, ['w1', 'all'])!} onClose={close} />);
    expect(screen.getByText('2 achievements')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(close).toHaveBeenCalled();
    rerender(<AchievementToast toast={toastFor(defs, ['w1'])!} />);
    expect(screen.getByText('First win')).toBeInTheDocument();
  });
});
