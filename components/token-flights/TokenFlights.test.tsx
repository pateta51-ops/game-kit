import { act, render as mount } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFlightLedger, isEmpty, type Placement } from './index.ts';
import { TokenFlights, useFlightLedger, type TokenFlightsProps } from './ui.ts';

const supplyOf = (p: string): string | undefined => (p === 'credits' ? 'bank' : undefined);
const animations: { finish: () => void }[] = [];

beforeEach(() => {
  animations.length = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ x: 10, y: 10, left: 10, top: 10, width: 100, height: 60, right: 110, bottom: 70 }) as DOMRect,
  );
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: function animate() {
      const a = { onfinish: null as null | (() => void), oncancel: null as null | (() => void), cancel: () => a.oncancel?.() };
      animations.push({ finish: () => a.onfinish?.() });
      return a;
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
  vi.useRealTimers();
});

const flights = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[data-part="token-flight"]')];
const landAll = (): void => { act(() => { for (const a of animations.splice(0)) a.finish(); }); };

function setup(extra: Partial<TokenFlightsProps> = {}) {
  const ledger = createFlightLedger();
  const landed: number[] = [];
  function Table({ credits, undoNo = 0 }: { credits: number[]; undoNo?: number }) {
    useFlightLedger(ledger);
    const placement: Placement = { credits };
    return (
      <>
        <div data-place="bank" />
        <div data-res="credits" />
        <TokenFlights
          placement={placement} supplyOf={supplyOf} ledger={ledger} speed={1} undoNo={undoNo}
          render={() => ({ src: 'coin.png', size: 20 })} onLand={(m) => landed.push(m.value)} {...extra}
        />
      </>
    );
  }
  return { ledger, landed, Table };
}

describe('TokenFlights', () => {
  it('flies a token from the supply to the place (data-place, data-res), books the ledger, lands it and tells onLand', () => {
    const { ledger, landed, Table } = setup();
    const r = mount(<Table credits={[]} />);
    expect(flights()).toHaveLength(0);
    r.rerender(<Table credits={[1]} />);
    expect(flights()).toHaveLength(1);
    expect(isEmpty(ledger.get())).toBe(false);
    landAll();
    expect(flights()).toHaveLength(0);
    expect(isEmpty(ledger.get())).toBe(true);
    expect(landed).toEqual([1]);
  });

  it('holds a token until the game launches it, and staggers the second one', () => {
    vi.useFakeTimers();
    const held: (() => void)[] = [];
    const { Table } = setup({ hold: (_m, launch) => { held.push(launch); } });
    const r = mount(<Table credits={[]} />);
    r.rerender(<Table credits={[1, 1]} />);
    expect(flights()).toHaveLength(0);
    act(() => { for (const l of held) l(); });
    expect(flights()).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(200); });
    expect(flights()).toHaveLength(2);
  });

  it('settles at once on speed 0, enabled false, reduced motion and undo, and cuts flights in the air', () => {
    const { ledger, Table } = setup();
    const r = mount(<Table credits={[]} />);
    r.rerender(<Table credits={[1]} />);
    expect(flights()).toHaveLength(1);
    r.rerender(<Table credits={[]} undoNo={1} />);
    expect(flights()).toHaveLength(0);
    expect(isEmpty(ledger.get())).toBe(true);
    for (const off of [{ speed: 0 }, { enabled: false }, { reduced: () => true }]) {
      const s = setup(off);
      const x = mount(<s.Table credits={[]} />);
      x.rerender(<s.Table credits={[1]} />);
      expect(flights()).toHaveLength(0);
      expect(isEmpty(s.ledger.get())).toBe(true);
      x.unmount();
    }
  });

  it('draws nothing when the place cannot be found', () => {
    const { ledger, Table } = setup({ find: () => null });
    const r = mount(<Table credits={[]} />);
    r.rerender(<Table credits={[1]} />);
    expect(flights()).toHaveLength(0);
    expect(isEmpty(ledger.get())).toBe(true);
  });

  it('the default lookup skips a match that is empty or off screen and takes the visible one', () => {
    const { Table } = setup();
    const r = mount(<><div data-place="bank" data-t="hidden" /><div data-place="bank" data-t="far" /><Table credits={[]} /></>);
    const rect = (left: number, w: number) => ({ x: left, y: 10, left, top: 10, width: w, height: w, right: left + w, bottom: 10 + w }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const t = this.getAttribute('data-t');
      return t === 'hidden' ? rect(0, 0) : t === 'far' ? rect(5000, 50) : rect(10, 100);
    });
    r.rerender(<><div data-place="bank" data-t="hidden" /><div data-place="bank" data-t="far" /><Table credits={[1]} /></>);
    expect(flights()).toHaveLength(1);
    expect(flights()[0]!.style.left).toBe('50px'); // the in-view bank: centre x 60, half size 10
  });

  it('unmounting settles: flights removed, ledger empty', () => {
    const { ledger, Table } = setup();
    const r = mount(<Table credits={[]} />);
    r.rerender(<Table credits={[1]} />);
    expect(isEmpty(ledger.get())).toBe(false);
    r.unmount();
    expect(flights()).toHaveLength(0);
    expect(isEmpty(ledger.get())).toBe(true);
  });

  it('no more than maxFlying tokens are in the air (24 by default)', () => {
    vi.useFakeTimers();
    const { ledger, Table } = setup({ maxFlying: 3 });
    const r = mount(<Table credits={[]} />);
    r.rerender(<Table credits={[1, 1, 1, 1, 1]} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(flights()).toHaveLength(3);
    expect(Object.values(ledger.get().incoming.credits ?? {}).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('an undo mid-flight leaves no ghost and an empty ledger', () => {
    const { ledger, Table } = setup();
    const r = mount(<Table credits={[]} />);
    r.rerender(<Table credits={[1, 1]} />);
    expect(flights().length).toBeGreaterThan(0);
    r.rerender(<Table credits={[]} undoNo={1} />);
    expect(flights()).toHaveLength(0);
    expect(isEmpty(ledger.get())).toBe(true);
  });
});
