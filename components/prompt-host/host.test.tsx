import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../engine-core/index.ts';
import { autoAnswer } from './index.ts';
import { May, Order, PayCost, PickAmount, PickOptions, PromptHost, type PromptOf, type WidgetProps, type Widgets } from './ui.ts';
import { MARKET, type MarketPrompt, type MarketState } from './fake/market.ts';

type View = { readonly got: number };
const WIDGETS: Widgets<MarketPrompt, View> = {
  pick: PickOptions,
  amount: (p) => <PickAmount {...p} start="last" />,
  order: Order,
  may: May,
  pay: PayCost,
};

// @ts-expect-error a kind with no widget fails to compile
const MISSING: Widgets<MarketPrompt, View> = { pick: PickOptions, amount: PickAmount, order: Order, may: May };
void MISSING;
// a widget written for one kind sees that kind
const OnlyMay = ({ prompt }: WidgetProps<PromptOf<MarketPrompt, 'may'>, View>) => <i>{prompt.kind satisfies 'may'}</i>;
void ({ ...WIDGETS, may: OnlyMay } satisfies Widgets<MarketPrompt, View>);

const strip = (s: string): string => s.replace(/ \([A-Z]+-\d+\)/g, '');
let last: MarketState;
function Game({ auto = false, mine = true }: { auto?: boolean; mine?: boolean }) {
  const [s, set] = useState(() => createGame(MARKET, { seed: 's' }, null, null).state);
  useEffect(() => {
    last = s;
  });
  return (
    <PromptHost
      widgets={WIDGETS}
      prompt={s.prompt}
      view={{ got: s.got.length }}
      mine={mine}
      waiting={<p>Waiting for the other player</p>}
      auto={(p) => autoAnswer(p, auto)}
      answer={(picks, promptId) => set((x) => (promptId !== undefined && x.prompt?.id === promptId ? applyAction(MARKET, x, { kind: 'answer', promptId, picks }, null).state : x))}
      look={{ text: strip }}
    />
  );
}
const opt = (id: string): HTMLElement => document.querySelector(`[data-option="${id}"]`)!;
const done = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
};

describe('PromptHost (K123)', () => {
  it('each common widget answers its prompt through engine-core', () => {
    render(<Game />);
    expect(screen.getByTestId('prompt')).toHaveAttribute('data-kind', 'pick');
    expect(opt('c')).toHaveAttribute('aria-disabled', 'true');
    expect(opt('c')).toHaveTextContent('Too heavy');
    expect(opt('c').textContent).not.toMatch('TURN-07');
    fireEvent.click(opt('c'));
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    fireEvent.click(opt('b'));
    fireEvent.click(opt('a'));
    done();
    expect(last.got).toEqual([['b', 'a']]);

    expect(screen.getByTestId('prompt')).toHaveAttribute('data-kind', 'amount');
    fireEvent.click(screen.getByRole('button', { name: '-' }));
    done();
    expect(last.got[1]).toEqual(['2']);

    fireEvent.click(opt('z'));
    fireEvent.click(opt('x'));
    expect(opt('x')).toHaveTextContent('2');
    fireEvent.click(opt('y'));
    fireEvent.click(opt('x'));
    done();
    expect(last.got[2]).toEqual(['z', 'x', 'y']);

    expect(screen.getByRole('heading')).toHaveTextContent('You may draw a card.');
    fireEvent.click(opt('yes'));
    expect(last.got[3]).toEqual(['yes']);

    fireEvent.click(opt('strife'));
    expect(last.got).toHaveLength(4);
    fireEvent.click(opt('gold'));
    expect(last.result).toEqual({ kind: 'done' });
    expect(screen.queryByTestId('prompt')).toBeNull();
  });

  it('auto-answers a forced prompt once and asks the rest', () => {
    render(<Game auto />);
    fireEvent.click(opt('a'));
    done();
    done();
    done();
    act(() => {
      fireEvent.click(opt('no'));
    });
    expect(last.got).toEqual([['a'], ['3'], ['x', 'y', 'z'], ['no'], ['gold']]);
    expect(last.result).toEqual({ kind: 'done' });
  });

  it("shows another seat's prompt as waiting, with no option", () => {
    render(<Game mine={false} />);
    expect(screen.getByText('Waiting for the other player')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('K222: with `seat` and no `mine`, the prompt is mine only when its seat matches', () => {
    const base = createGame(MARKET, { seed: 's' }, null, null).state.prompt as MarketPrompt;
    const at = (seat: string, p: MarketPrompt & { seat?: string }) =>
      render(<PromptHost widgets={WIDGETS} prompt={p} view={{ got: 0 }} seat={seat} waiting={<p>Waiting</p>} answer={() => undefined} />);
    at('a', { ...base, seat: 'b' }).unmount();
    at('a', { ...base, seat: 'b' });
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    at('b', { ...base, seat: 'b' });
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('K222: seat 0 and seat "0" are one seat (seatKey)', () => {
    const base = createGame(MARKET, { seed: 's' }, null, null).state.prompt as MarketPrompt;
    render(<PromptHost widgets={WIDGETS} prompt={{ ...base, seat: '0' } as MarketPrompt} view={{ got: 0 }} seat={0} waiting={<p>Waiting</p>} answer={() => undefined} />);
    expect(screen.queryByText('Waiting')).toBeNull();
  });
});

describe('PickOptions at the maximum (K408)', () => {
  it('choose 2 of 5: unpicked options disable at 2 picks and enable on undo', () => {
    const prompt = { id: 'p', kind: 'pick', options: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, enabled: true })), min: 2, max: 2 } as unknown as MarketPrompt;
    render(<PromptHost widgets={WIDGETS} prompt={prompt} view={{ got: 0 }} mine waiting={null} auto={() => null} answer={() => {}} look={{ text: strip }} />);
    const dis = (id: string): boolean => opt(id).getAttribute('aria-disabled') === 'true';
    fireEvent.click(opt('a'));
    expect(['b', 'c', 'd', 'e'].some(dis)).toBe(false);
    fireEvent.click(opt('b'));
    expect(['c', 'd', 'e'].every(dis)).toBe(true);
    fireEvent.click(opt('c'));
    expect(opt('c')).toHaveAttribute('aria-pressed', 'false');
    expect(dis('a') || dis('b')).toBe(false);
    fireEvent.click(opt('a'));
    expect(['a', 'c', 'd', 'e'].some(dis)).toBe(false);
    fireEvent.click(opt('d'));
    expect(['a', 'b', 'e'].filter(dis)).toEqual(['a', 'e']);
    expect(opt('d')).toHaveAttribute('aria-pressed', 'true');
  });
});
