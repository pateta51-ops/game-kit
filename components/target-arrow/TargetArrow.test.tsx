import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIM_ATTR, TargetArrow, createStrikes, type ArrowPrompt } from './ui.ts';

const prompt = (): ArrowPrompt => ({ id: 'p7', options: [{ id: 't1' }, { id: 't2', disabled: true }] });
const box = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height }) as DOMRect;
function place(attr: string, id: string, rect: DOMRect): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute(attr, id);
  el.getBoundingClientRect = () => rect;
  document.body.appendChild(el);
  return el;
}
const frame = (): Promise<void> => act(() => new Promise<void>((r) => window.requestAnimationFrame(() => r())));
const move = async (x: number, y: number): Promise<void> => {
  document.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
  await frame();
};
const arrow = (): SVGSVGElement => document.querySelector<SVGSVGElement>('[data-part="target-arrow"]') as SVGSVGElement;

let target: HTMLElement;
let strikes = createStrikes<ArrowPrompt>();
const props = (p: ArrowPrompt | null, extra: object = {}) => ({
  prompt: p,
  strikes,
  speed: 1,
  source: () => document.querySelector<HTMLElement>('[data-src]'),
  reduced: () => false,
  ...extra,
});

beforeEach(() => {
  strikes = createStrikes<ArrowPrompt>();
  place('data-src', '', box(0, 500, 100, 140));
  target = place('data-target-id', 't1', box(600, 100, 120, 90));
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('TargetArrow', () => {
  it('follows the pointer from the source, decorative only', async () => {
    render(<TargetArrow {...props(prompt())} />);
    expect(arrow()).toHaveAttribute('aria-hidden', 'true');
    expect(arrow()).toHaveAttribute('data-state', 'hidden');
    await move(300, 300);
    expect(arrow()).toHaveAttribute('data-state', 'follow');
    expect(arrow().querySelector('[data-part="target-arrow-body"]')?.getAttribute('d')).toMatch(/^M 50 570 Q /);
  });

  it('snaps to a legal target and brightens it; a disabled option is no target', async () => {
    place('data-target-id', 't2', box(900, 100, 120, 90));
    render(<TargetArrow {...props(prompt())} />);
    await move(610, 110);
    expect(arrow()).toHaveAttribute('data-snapped', 'true');
    expect(target).toHaveAttribute(AIM_ATTR, 'true');
    await move(950, 140);
    expect(arrow()).toHaveAttribute('data-snapped', 'false');
    expect(target).not.toHaveAttribute(AIM_ATTR);
  });

  it('snaps to the panel button for an option (prompt-host data-option)', async () => {
    target.remove();
    place('data-option', 't1', box(10, 10, 80, 30));
    render(<TargetArrow {...props(prompt())} />);
    await move(20, 20);
    expect(arrow()).toHaveAttribute('data-snapped', 'true');
  });

  it('an automatic answer grows an arrow, holds the flights until the hit, then goes', async () => {
    const onHit = vi.fn();
    const launch = vi.fn();
    const { rerender } = render(<TargetArrow {...props(prompt(), { onHit, damage: () => true })} />);
    await move(610, 110);
    act(() => {
      strikes.announce({ prompt: prompt(), ids: ['t1'], auto: true });
    });
    rerender(<TargetArrow {...props(null, { onHit })} />);
    strikes.hold({}, launch);
    expect(launch).not.toHaveBeenCalled();
    await waitFor(() => expect(arrow()).toHaveAttribute('data-state', 'strike'));
    await waitFor(() => expect(launch).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(arrow()).toHaveAttribute("data-state", "hidden");
    expect(onHit).toHaveBeenCalledWith(target, true);
  });

  it('hidden without a target prompt, with the switch off, and on a touch', async () => {
    const { rerender } = render(<TargetArrow {...props(null)} />);
    await move(300, 300);
    expect(arrow()).toHaveAttribute('data-state', 'hidden');
    rerender(<TargetArrow {...props(prompt(), { enabled: false })} />);
    await move(310, 300);
    expect(arrow()).toHaveAttribute('data-state', 'hidden');
    rerender(<TargetArrow {...props(prompt())} />);
    const touch = new MouseEvent('pointermove', { clientX: 300, clientY: 300, bubbles: true });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    document.dispatchEvent(touch);
    await frame();
    expect(arrow()).toHaveAttribute('data-state', 'hidden');
  });

  it('speed 0 or reduced motion: no moving parts, a choice removes it at once and holds nothing', async () => {
    for (const extra of [{ speed: 0 }, { reduced: () => true }]) {
      const { unmount } = render(<TargetArrow {...props(prompt(), extra)} />);
      await move(300, 300);
      expect(arrow()).toHaveAttribute('data-state', 'follow');
      expect(arrow()).toHaveAttribute('data-motion', 'off');
      act(() => {
        strikes.announce({ prompt: prompt(), ids: ['t1'], auto: true });
      });
      expect(arrow()).toHaveAttribute('data-state', 'hidden');
      expect(strikes.holding()).toBe(false);
      unmount();
    }
  });

  it('an answer the game refuses (prompt stays open) strikes nothing and lets the flights go', async () => {
    render(<TargetArrow {...props(prompt())} />);
    await move(610, 110);
    act(() => {
      strikes.announce({ prompt: prompt(), ids: ['t1'], auto: true });
    });
    expect(strikes.holding()).toBe(true);
    await waitFor(() => expect(strikes.holding()).toBe(false));
    await frame();
    expect(arrow()).not.toHaveAttribute('data-state', 'strike');
  });

  it('an undo during a strike stops it and lets the flights go', async () => {
    const { rerender } = render(<TargetArrow {...props(prompt(), { undoNo: 0 })} />);
    await move(610, 110);
    act(() => {
      strikes.announce({ prompt: prompt(), ids: ['t1'], auto: true });
    });
    rerender(<TargetArrow {...props(null, { undoNo: 0 })} />);
    expect(strikes.holding()).toBe(true);
    rerender(<TargetArrow {...props(null, { undoNo: 1 })} />);
    expect(strikes.holding()).toBe(false);
    expect(arrow()).toHaveAttribute('data-state', 'hidden');
  });

  it('unmounting mid-strike ends the hold and stops the frame loop', async () => {
    const { unmount } = render(<TargetArrow {...props(prompt())} />);
    await move(610, 110);
    act(() => {
      strikes.announce({ prompt: prompt(), ids: ['t1'], auto: true });
    });
    expect(strikes.holding()).toBe(true);
    unmount();
    expect(strikes.holding()).toBe(false);
    await frame();
    const spy = vi.spyOn(window, 'requestAnimationFrame');
    await new Promise((r) => setTimeout(r, 60));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a modal dialog hides the arrow and the aim', async () => {
    render(<TargetArrow {...props(prompt())} />);
    await move(610, 110);
    expect(target).toHaveAttribute(AIM_ATTR, 'true');
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    await frame();
    await frame();
    expect(arrow()).toHaveAttribute('data-state', 'hidden');
    expect(target).not.toHaveAttribute(AIM_ATTR);
  });
});
