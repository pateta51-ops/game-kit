import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { advance, noSteps, pushSteps } from '../paced-view/index.ts';
import { banner, filterSeat, gameResult, groupByTurn, logLines, opponentTurn, phaseChanged } from './index.ts';
import { GameOver, GameOverActions, LogPanel, OpponentTurnPanel, TurnBanner } from './ui.tsx';

type Ev = { type: 'hit' | 'noise' | 'move'; seat?: string; turn?: number; n?: number };
const words = { hit: '{seat} takes {n} damage', move: 'moves' };
const evs: Ev[] = [{ type: 'hit', seat: 'a', turn: 1, n: 2 }, { type: 'noise', turn: 1 }, { type: 'move', seat: 'b', turn: 2 }];

describe('log', () => {
  it('fills slots, stays silent without words, groups by turn, filters by seat', () => {
    const lines = logLines(evs, words);
    expect(lines.map((l) => l.text)).toEqual(['a takes 2 damage', 'moves']);
    expect(groupByTurn(lines).map((g) => g.turn)).toEqual([1, 2]);
    expect(filterSeat(lines, 'a')).toHaveLength(1);
    expect(filterSeat(lines, null)).toHaveLength(2);
  });
  it('panel scrolls to the newest and filters', () => {
    const lines = logLines(evs, words);
    render(<LogPanel lines={lines} seats={['a', 'b']} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByText('b'));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('opponent turn', () => {
  const isStep = (e: Ev) => e.type !== 'noise';
  const describe_ = (e: Ev, v: string) => (e.seat === v || e.seat === undefined ? e.type : null);
  it('shows done, current and hides what the viewer may not see', () => {
    let s = pushSteps(noSteps<string, Ev>(), 'v', evs, isStep);
    let t = opponentTurn(s, isStep, describe_, 'a');
    expect(t.done).toHaveLength(0);
    expect(t.current?.text).toBe('hit');
    expect(t.left).toBe(1);
    s = advance(s);
    t = opponentTurn(s, isStep, describe_, 'a');
    expect(t.done).toHaveLength(1);
    expect(t.current?.hidden).toBe(true);
  });
  it('skip control calls back', () => {
    const s = pushSteps(noSteps<string, Ev>(), 'v', evs, isStep);
    const onSkip = vi.fn();
    render(<OpponentTurnPanel turn={opponentTurn(s, isStep, describe_, 'a')} onSkip={onSkip} />);
    fireEvent.click(screen.getByText(/Skip to end/));
    expect(onSkip).toHaveBeenCalled();
  });
});

describe('game over', () => {
  it('ranks, shares ties, lowWins', () => {
    expect(gameResult({ a: 5, b: 9, c: 9 }).winners).toEqual(['b', 'c']);
    expect(gameResult({ a: 5, b: 9 }).standings.map((x) => x.seat)).toEqual(['b', 'a']);
    expect(gameResult({ a: 5, b: 9 }, { lowWins: true }).winners).toEqual(['a']);
  });
  it('actions', () => {
    const onHome = vi.fn();
    render(<GameOver result={gameResult({ a: 1, b: 2 })} breakdown={(s) => <i>detail {s}</i>} onHome={onHome} />);
    expect(screen.getByText('detail b')).toBeTruthy();
    fireEvent.click(screen.getByText('Home'));
    expect(onHome).toHaveBeenCalled();
  });
});

describe('game over solo (K301)', () => {
  const solo = { standings: [], winners: [], tied: false };
  it('title slot, reason, no standings, detachable actions', () => {
    const onHome = vi.fn();
    const { container } = render(<><GameOver result={solo} title={<b>Defeat</b>} reason="The tower fell" actions={false} /><GameOverActions onHome={onHome} /></>);
    expect(screen.getByText('Defeat')).toBeTruthy();
    expect(container.querySelector('[data-part="game-over-reason"]')?.textContent).toBe('The tower fell');
    expect(container.querySelector('ol')).toBeNull();
    expect(container.querySelector('section [data-part="game-over-actions"]')).toBeNull();
    fireEvent.click(screen.getByText('Home'));
    expect(onHome).toHaveBeenCalled();
    expect(container.querySelector('button')?.hasAttribute('data-kit')).toBe(true);
  });
  it('standing without score; standings={false}', () => {
    const r = { standings: [{ seat: 'a', rank: 1 }], winners: ['a'], tied: false };
    const { container, rerender } = render(<GameOver result={r} />);
    expect(container.querySelector('li b')).toBeNull();
    expect(screen.getByText('Winner: a')).toBeTruthy();
    rerender(<GameOver result={gameResult({ a: 1 })} standings={false} />);
    expect(container.querySelector('ol')).toBeNull();
  });
});

describe('banner', () => {
  const phases = [{ id: 'u1', name: 'Upkeep' }, { id: 'u2', name: 'Act' }];
  it('names the phase', () => {
    expect(banner(phases, 3, 'a', 'u2')).toMatchObject({ phase: 'Act', index: 1, count: 2 });
    expect(phaseChanged(null, banner(phases, 1, 'a', 'u1'))).toBe(false);
  });
  it('fires on change, not on first show', () => {
    const on = vi.fn();
    const { rerender } = render(<TurnBanner phases={phases} turn={1} seat="a" phase="u1" onPhase={on} />);
    expect(on).not.toHaveBeenCalled();
    act(() => rerender(<TurnBanner phases={phases} turn={1} seat="a" phase="u2" onPhase={on} />));
    expect(on).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Act')).toBeTruthy();
  });

  it('K293: default banner prints Turn n; turnName replaces it', () => {
    const { container, rerender } = render(<TurnBanner phases={phases} turn={2} seat="a" phase="u1" />);
    expect(container.querySelector('[data-part="turn"]')?.textContent).toBe('Turn 2');
    rerender(<TurnBanner phases={phases} turn={2} seat="a" phase="u1" turnName={(t) => `Round ${t}`} />);
    expect(container.textContent).not.toContain('Turn');
    expect(container.querySelector('[data-part="turn"]')?.textContent).toBe('Round 2');
  });
  it('K304: phaseName replaces the phase words; null drops the phase span', () => {
    const { container, rerender } = render(<TurnBanner phases={phases} turn={2} seat="a" phase="u1" phaseName={(b) => `${b.phase}!`} />);
    expect(container.querySelector('[data-part="phase"]')?.textContent).toBe('Upkeep!');
    rerender(<TurnBanner phases={phases} turn={2} seat="a" phase="u1" phaseName={() => null} />);
    expect(container.querySelector('[data-part="phase"]')).toBeNull();
  });
  it('K293: every button carries data-kit', () => {
    const { container } = render(<><LogPanel lines={[]} seats={['a']} /><GameOver result={gameResult({ a: 1, b: 2 })} onHome={() => {}} onRematch={() => {}} onReview={() => {}} /><OpponentTurnPanel turn={{ done: [], current: { index: 0, text: 'x', hidden: false }, left: 0, total: 1 }} onSkip={() => {}} /></>);
    const bs = [...container.querySelectorAll('button')];
    expect(bs.length).toBeGreaterThan(4);
    expect(bs.every((b) => b.hasAttribute('data-kit'))).toBe(true);
  });
});
