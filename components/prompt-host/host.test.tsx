import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../engine-core/index';
import { autoAnswer } from './index';
import { May, Order, PayCost, PickAmount, PickOptions, PromptHost, type PromptOf, type WidgetProps, type Widgets } from './ui';
import { MARKET, type MarketPrompt, type MarketState } from './fake/market';

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
});
