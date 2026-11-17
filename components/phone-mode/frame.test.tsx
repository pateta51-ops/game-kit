import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhoneArea, PhoneFrame, PhoneMenu, PromptLine, SheetActions, Sheet, TabBar } from './ui.ts';

const tabs = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B', lit: true, litNote: 'pick here' },
];

describe('Imperium phone parts (K263)', () => {
  it('tab bar: active is pressed, lit tab marked, every tap reported, a tap on the active tab scrolls its area up', () => {
    const onTab = vi.fn();
    const { container } = render(
      <PhoneFrame top={null} dock={null} dockOpen={false} tab="a" tabs={<TabBar tabs={tabs} active="a" onTab={onTab} label="Sections" />}>
        <PhoneArea id="a" shown>x</PhoneArea>
        <PhoneArea id="b" shown={false}>y</PhoneArea>
      </PhoneFrame>,
    );
    const area = container.querySelector('[data-area="a"]') as HTMLElement;
    const scrollTo = vi.fn();
    area.scrollTo = scrollTo as never;
    expect(screen.getByTestId('tab-a').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tab-b').dataset['pick']).toBe('true');
    expect(screen.getByText('pick here')).toBeTruthy();
    expect(container.querySelector('[data-area="b"]')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(screen.getByTestId('tab-a'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    fireEvent.click(screen.getByTestId('tab-b'));
    expect(onTab).toHaveBeenLastCalledWith('b');
  });

  it('prompt line: folded shows the line and counts, open shows the head; the body stays mounted', () => {
    const toggle = vi.fn();
    const { rerender } = render(
      <PromptLine open={false} onToggle={toggle} short="Play a card" counts={<b>3</b>} kicker="Decision" label="Decision"><i data-testid="body" /></PromptLine>,
    );
    expect(screen.getByTestId('dock-short').textContent).toBe('Play a card');
    expect(screen.getByTestId('body')).toBeTruthy();
    fireEvent.click(screen.getByTestId('dock-toggle'));
    expect(toggle).toHaveBeenCalled();
    rerender(<PromptLine open onToggle={toggle} short="Play a card" kicker="Decision" label="Decision" />);
    expect(screen.queryByTestId('dock-short')).toBeNull();
    expect(screen.getByText('Decision')).toBeTruthy();
  });

  it('menu: a press on a button inside closes it; Escape closes', () => {
    const onClose = vi.fn();
    render(<PhoneMenu open onClose={onClose} label="Menu"><button type="button">Go</button></PhoneMenu>);
    fireEvent.click(screen.getByText('Go'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('sheet: an early scrim tap is ignored with arriveMs, a swipe down past 70 px closes, a short drag does not, Escape closes', () => {
    const onClose = vi.fn();
    render(
      <Sheet title="Card" onClose={onClose} slideMs={0} arriveMs={250} foot={<SheetActions actions={[{ id: 'p', label: 'Play', primary: true, onPress: onClose }, { id: 'c', label: 'Cancel', onPress: onClose }]} reason="Not now" />}>
        body
      </Sheet>,
    );
    fireEvent.click(screen.getByTestId('phone-sheet-scrim'));
    expect(onClose).not.toHaveBeenCalled();
    const head = screen.getByText('Card').parentElement as HTMLElement;
    fireEvent.pointerDown(head, { clientY: 10 });
    fireEvent.pointerMove(head, { clientY: 50 });
    fireEvent.pointerUp(head);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(head, { clientY: 10 });
    fireEvent.pointerMove(head, { clientY: 100 });
    fireEvent.pointerUp(head);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Play').dataset['primary']).toBe('true');
    expect(screen.getByText('Cancel').dataset['primary']).toBeUndefined();
  });
});
