import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { advance, noSteps, pushSteps } from '../paced-view/index.ts';
import { banner, filterSeat, gameResult, groupByTurn, logLines, opponentTurn, phaseChanged, wholeLinesHeight, wholeEntriesHeight } from './index.ts';
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

describe('game over extra (K734)', () => {
  it('extra renders inside game-over-actions after Home', () => {
    for (const ui of [<GameOverActions onHome={() => {}} extra={<button>New Mission</button>} />, <GameOver result={gameResult({ a: 1 })} onHome={() => {}} extra={<button>New Mission</button>} />]) {
      const { container, unmount } = render(ui);
      const kids = [...container.querySelector('[data-part="game-over-actions"]')!.children].map((c) => c.textContent);
      expect(kids).toEqual(['Home', 'New Mission']);
      unmount();
    }
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

describe('log order and whole lines (K710)', () => {
  const many = Array.from({ length: 4 }, (_, i) => ({ type: 'hit' as const, seat: i % 2 ? 'b' : 'a', turn: i < 2 ? 1 : 2, n: i }));
  const lines = logLines(many, words);
  const texts = () => screen.getAllByRole('listitem').map((l) => l.textContent);
  const stub = (name: string, get: (el: HTMLElement) => number) => {
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get(this: HTMLElement) { return get(this); } });
    return () => { if (d) Object.defineProperty(HTMLElement.prototype, name, d); else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]; };
  };
  it('default order is unchanged', () => {
    render(<LogPanel lines={lines} />);
    expect(texts()).toEqual(['a takes 0 damage', 'b takes 1 damage', 'a takes 2 damage', 'b takes 3 damage']);
  });
  it('newest-first reverses turns and lines, keeps grouping, filters the other seat, scrolls to top', () => {
    const sets: number[] = [];
    const un = stub('scrollHeight', () => 500);
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get() { return 77; }, set(v: number) { sets.push(v); } });
    try {
      const { container } = render(<LogPanel lines={lines} order="newest-first" seats={['a', 'b']} />);
      expect(texts()).toEqual(['b takes 3 damage', 'a takes 2 damage', 'b takes 1 damage', 'a takes 0 damage']);
      expect([...container.querySelectorAll('[data-part=log-turn]')].map((x) => x.getAttribute('data-turn'))).toEqual(['2', '1']);
      expect(sets.at(-1)).toBe(0);
      fireEvent.click(screen.getByText('a'));
      expect(texts()).toEqual(['a takes 2 damage', 'a takes 0 damage']);
    } finally { un(); if (desc) Object.defineProperty(Element.prototype, 'scrollTop', desc); }
  });
  it('oldest-first scrolls to the bottom', () => {
    const sets: number[] = [];
    const un = stub('scrollHeight', () => 500);
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get() { return 0; }, set(v: number) { sets.push(v); } });
    try { render(<LogPanel lines={lines} />); expect(sets.at(-1)).toBe(500); } finally { un(); if (desc) Object.defineProperty(Element.prototype, 'scrollTop', desc); }
  });
  it('wholeLinesHeight: 1070 px box, 29 px lines shows 36 lines, 1044 px', () => {
    expect(wholeLinesHeight(1070, 29)).toBe(1044);
    expect(1044 / 29).toBe(36);
  });
  it('wholeLines snaps the box height and re-scrolls after it', () => {
    const order: string[] = [];
    const un = stub('clientHeight', (el) => (el.style.height ? parseFloat(el.style.height) : 1070));
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get() { return 0; }, set(this: HTMLElement) { order.push(this.style.height); } });
    try {
      const { container } = render(<LogPanel lines={lines} wholeLines={29} />);
      expect((container.querySelector('[data-part=log-lines]') as HTMLElement).style.height).toBe('1044px');
      expect(order.at(-1)).toBe('1044px');
    } finally { un(); if (desc) Object.defineProperty(Element.prototype, 'scrollTop', desc); }
  });
  it('K716 wholeEntriesHeight: entries of 1-3 lines, the last whole one sets the height, from the start or from the end', () => {
    const e = [{ top: 0, bottom: 29 }, { top: 29, bottom: 116 }, { top: 116, bottom: 174 }, { top: 174, bottom: 261 }];
    expect(wholeEntriesHeight(200, e)).toBe(174);
    expect(wholeEntriesHeight(200, e, true)).toBe(145);
    expect(wholeEntriesHeight(20, e)).toBe(null);
    expect(wholeEntriesHeight(500, [])).toBe(null);
  });
  it('K716 wholeLines={true} measures each entry, so a wrapped entry at the bottom is never half cut', () => {
    const un1 = stub('clientHeight', (el) => (el.style.height ? parseFloat(el.style.height) : 200));
    const heights = [20, 29, 87, 58, 87];
    const rect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const all = [...(this.closest('[data-part=log-lines]')?.querySelectorAll('h4, li') ?? [])];
      const i = all.indexOf(this);
      if (i < 0) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} };
      const top = heights.slice(0, i).reduce((a, b) => a + b, 0), h = heights[i] ?? 29;
      return { top, bottom: top + h, left: 0, right: 0, width: 0, height: h, x: 0, y: top, toJSON() {} };
    };
    try {
      const two = [{ id: 1, turn: 1, text: 'one' }, { id: 2, turn: 1, text: 'three lines' }, { id: 3, turn: 1, text: 'two lines' }, { id: 4, turn: 1, text: 'three lines' }];
      const { container } = render(<LogPanel lines={two} wholeLines order="newest-first" />);
      expect((container.querySelector('[data-part=log-lines]') as HTMLElement).style.height).toBe('194px');
      const un2 = stub('scrollHeight', () => 291);
      try {
        const old = render(<LogPanel lines={two} wholeLines />);
        expect((old.container.querySelector('[data-part=log-lines]') as HTMLElement).style.height).toBe('155px');
      } finally { un2(); }
    } finally { un1(); if (rect) Object.defineProperty(Element.prototype, 'getBoundingClientRect', rect); }
  });
  it('K716 fromEnd counts from the scroll end, so trailing margin or padding does not cut the first whole entry', () => {
    const e = [{ top: 0, bottom: 29 }, { top: 29, bottom: 116 }, { top: 116, bottom: 174 }, { top: 174, bottom: 261 }];
    expect(wholeEntriesHeight(200, e, true, 271)).toBe(155);
  });
  it('no wholeLines leaves the height alone', () => {
    const { container } = render(<LogPanel lines={lines} />);
    expect((container.querySelector('[data-part=log-lines]') as HTMLElement).style.height).toBe('');
  });
});
