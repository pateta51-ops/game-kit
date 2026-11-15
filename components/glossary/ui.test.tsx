import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLookup, type GlossaryEntry } from './index';
import { GlossaryProvider, GlossaryText, HOLD_MS, LookupHost } from './ui';

const E: GlossaryEntry[] = [
  { id: 'stun', term: 'stun', kind: 'term', summary: 'Stops an enemy.', body: 'One.\n\nTwo.', rules: ['R-1', 'R-2'], see: ['enemy'] },
  { id: 'enemy', term: 'enemy', summary: 'A foe you can stun.' },
  { id: 'energy', term: 'energy', icon: 'energy', summary: 'Fuel.' },
];

const app = (text: string, host: Partial<Parameters<typeof LookupHost>[0]> = {}, extra?: ReactNode) => (
  <GlossaryProvider entries={E} renderIcon={(code, e) => <img alt={e?.term ?? code} data-code={code} />}>
    <p data-testid="text">
      <GlossaryText text={text} />
    </p>
    {extra}
    <LookupHost phone={false} kindTitle={(k) => `Kind ${k}`} ruleHref={(r) => `#rules/${r}`} glossaryHref={(id) => `#glossary/${id}`} {...host} />
  </GlossaryProvider>
);

afterEach(() => {
  act(() => {
    useLookup.getState().close();
  });
  vi.useRealTimers();
});

describe('GlossaryText and LookupHost', () => {
  it('links terms and icons; a press opens the popover, a link inside follows, Back returns, Escape closes', () => {
    render(app('Stun it for {energy}, [[nope]].'));
    expect(screen.getByTestId('text').textContent).toBe('Stun it for , .');
    expect(screen.getAllByTestId('glossary-link').map((l) => l.dataset['glossary'])).toEqual(['stun', 'energy']);
    expect(screen.getByAltText('energy')).toHaveAttribute('data-code', 'energy');
    fireEvent.click(screen.getAllByTestId('glossary-link')[0]!);
    const pop = screen.getByTestId('lookup');
    expect(pop).toHaveAttribute('role', 'dialog');
    expect(pop.getAttribute('aria-labelledby')).toBe(screen.getByTestId('lookup-term').id);
    expect(screen.getByTestId('lookup-term').textContent).toBe('stun');
    expect(screen.getByText('Kind term')).toBeInTheDocument();
    expect(screen.getByText('R-2')).toHaveAttribute('href', '#rules/R-2');
    expect(screen.getByTestId('lookup-glossary')).toHaveAttribute('href', '#glossary/stun');
    expect(screen.getByText('Two.')).toBeInTheDocument();
    const inside = screen.getAllByTestId('glossary-link').filter((l) => pop.contains(l) && l.dataset['glossary'] === 'enemy');
    fireEvent.click(inside[0]!);
    expect(screen.getByTestId('lookup-term').textContent).toBe('enemy');
    fireEvent.click(screen.getByTestId('lookup-back'));
    expect(screen.getByTestId('lookup-term').textContent).toBe('stun');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('lookup')).toBeNull();
  });

  it('hideRules leaves rule ids out; frame wraps the popover content with icon and name', () => {
    render(app('energy stun', { hideRules: true, frame: ({ icon, name, children }) => <div data-testid="frame" data-name={name}>{icon}{children}</div> }));
    fireEvent.click(screen.getAllByTestId('glossary-link')[0]!);
    expect(screen.getByTestId('frame')).toHaveAttribute('data-name', 'energy');
    expect(screen.getByTestId('frame').querySelector('img')).toHaveAttribute('data-code', 'energy');
    expect(screen.getByTestId('lookup-close')).toBeInTheDocument();
    act(() => { useLookup.getState().close(); });
    fireEvent.click(screen.getAllByTestId('glossary-link')[1]!);
    expect(screen.getByTestId('lookup-summary').textContent).toBe('Stops an enemy.');
    expect(screen.queryByText('R-1')).toBeNull();
    expect(screen.queryByText(/Rules/)).toBeNull();
  });

  it('on the phone sheet hideRules holds and a frame is ignored', () => {
    render(app('stun', { phone: true, hideRules: true, frame: ({ children }) => <div data-testid="frame">{children}</div> }));
    fireEvent.click(screen.getByTestId('glossary-link'));
    expect(screen.getByTestId('lookup-body')).toBeInTheDocument();
    expect(screen.queryByTestId('frame')).toBeNull();
    expect(screen.queryByText('R-1')).toBeNull();
  });

  it('a press outside closes; words are the game\'s; rules are plain text without routes', () => {
    render(app('stun', { words: { back: 'B', close: 'Shut', glossary: 'G', rule: 'Rl', rules: 'Rls', seeAlso: 'Also' }, ruleHref: undefined, glossaryHref: undefined }));
    fireEvent.click(screen.getByTestId('glossary-link'));
    expect(screen.getByTestId('lookup-close').textContent).toBe('Shut');
    expect(screen.queryByTestId('lookup-glossary')).toBeNull();
    expect(screen.getByText('R-1').tagName).toBe('SPAN');
    expect(screen.getByText(/Rls/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lookup-scrim'));
    expect(screen.queryByTestId('lookup')).toBeNull();
  });

  it('on a phone the lookup is phone-mode\'s sheet', () => {
    render(app('stun', { phone: true, slideMs: 0 }));
    fireEvent.click(screen.getByTestId('glossary-link'));
    expect(screen.getByTestId('lookup')).toHaveClass('kit-pm-sheet', 'kit-glo-sheet');
    expect(screen.getByTestId('lookup-term').textContent).toBe('stun');
    fireEvent.click(within('lookup-body', 'enemy'));
    expect(screen.getByTestId('lookup-term').textContent).toBe('enemy');
    fireEvent.click(screen.getByTestId('lookup-scrim'));
    expect(screen.queryByTestId('lookup')).toBeNull();
  });

  it('hold links inside a control: a click presses the control, right-click or a long press opens the entry', () => {
    vi.useFakeTimers();
    const pressed = vi.fn();
    render(
      <GlossaryProvider entries={E}>
        <button type="button" onClick={pressed}>
          <GlossaryText text="stun" mode="hold" />
        </button>
        <LookupHost phone={false} />
      </GlossaryProvider>,
    );
    const link = screen.getByTestId('glossary-link');
    fireEvent.click(link);
    expect(pressed).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('lookup')).toBeNull();
    fireEvent.contextMenu(link);
    expect(screen.getByTestId('lookup-term').textContent).toBe('stun');
    act(() => {
      useLookup.getState().close();
    });
    fireEvent.pointerDown(link, { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    fireEvent.click(link);
    expect(pressed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('lookup-term').textContent).toBe('stun');
  });

  it('without a provider nothing is linked', () => {
    render(<GlossaryText text="stun" />);
    expect(screen.queryByTestId('glossary-link')).toBeNull();
  });
});

function within(testId: string, glossary: string): HTMLElement {
  const box = screen.getByTestId(testId);
  return [...box.querySelectorAll<HTMLElement>('[data-glossary]')].find((l) => l.dataset['glossary'] === glossary)!;
}
