import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KernelOption } from '../engine-core/index.ts';
import { useBoardPick, type Answer } from '../prompt-host/ui.ts';
import { DragGhost, useDragDrop } from './ui.tsx';

const opts = (...ids: string[]): KernelOption[] => ids.map((id) => ({ id, enabled: !id.startsWith('-') }));
const prompt = (options: KernelOption[], max = 2) => ({ id: 1, kind: 'k', options, min: 2, max });

function Board({ p, answer, taps, enabled = true, speed = 'instant', confirm = false }: { p: ReturnType<typeof prompt>; answer: Answer; taps?: (s: string, t: string) => string[]; enabled?: boolean; speed?: number | 'instant'; confirm?: boolean }) {
  const pick = useBoardPick(p, answer, { confirm });
  const drag = useDragDrop({ pick, promptId: p.id, enabled, speed, ...(taps ? { taps } : {}) });
  return (
    <div onClickCapture={drag.onClickCapture}>
      <button data-testid="src" {...drag.sourceProps('a')} onClick={() => pick.tap('a')}>a</button>
      <div data-testid="t1" data-drop="b" />
      <div data-testid="t2" data-drop="-c" />
      <div data-testid="fan" data-drop-block><div data-drop="b" /></div>
      <DragGhost drag={drag} render={(s) => <i>{s}</i>} />
    </div>
  );
}

const ptr = (type: string, x: number, y: number, buttons = 1) => act(() => { window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, buttons })); });
const down = (el: Element) => fireEvent(el, new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0, buttons: 1 }));
const stack = (...els: (Element | null)[]) => { document.elementsFromPoint = () => els.filter((e): e is Element => e !== null); };

afterEach(() => { vi.unstubAllGlobals(); delete (HTMLElement.prototype as { animate?: unknown }).animate; delete (document as { elementsFromPoint?: unknown }).elementsFromPoint; });

describe('drag-drop (K220)', () => {
  it('a drop answers as tap source then tap target; the target shows data-drop-state while dragging', () => {
    const answer = vi.fn<Answer>();
    const { getByTestId } = render(<Board p={prompt(opts('a', 'b', '-c'))} answer={answer} />);
    const t1 = getByTestId('t1');
    stack(t1);
    down(getByTestId('src'));
    ptr('pointermove', 30, 0);
    expect(t1).toHaveAttribute('data-drop-state', 'over');
    expect(getByTestId('t2')).not.toHaveAttribute('data-drop-state');
    expect(document.querySelector('[data-part="ghost"]')).not.toBeNull();
    ptr('pointerup', 30, 0);
    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith(['a', 'b'], 1);
    expect(t1).not.toHaveAttribute('data-drop-state');
  });

  it('the taps can be mapped: a source whose click answers alone', () => {
    const answer = vi.fn<Answer>();
    const { getByTestId } = render(<Board p={prompt(opts('a', 'b'), 1)} answer={answer} taps={(s) => [s]} />);
    stack(getByTestId('t1'));
    down(getByTestId('src'));
    ptr('pointermove', 30, 0);
    ptr('pointerup', 30, 0);
    expect(answer).toHaveBeenCalledWith(['a'], 1);
  });

  it('an illegal target, the fan (data-drop-block), Escape and a short move answer nothing', () => {
    const answer = vi.fn<Answer>();
    const { getByTestId } = render(<Board p={prompt(opts('a', 'b', '-c'))} answer={answer} />);
    const src = getByTestId('src');
    stack(getByTestId('t2'));
    down(src); ptr('pointermove', 30, 0); ptr('pointerup', 30, 0);
    stack(getByTestId('fan').firstElementChild);
    down(src); ptr('pointermove', 30, 0); ptr('pointerup', 30, 0);
    stack(getByTestId('t1'));
    down(src); ptr('pointermove', 30, 0);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); });
    ptr('pointerup', 30, 0);
    down(src); ptr('pointermove', 3, 0); ptr('pointerup', 3, 0);
    expect(answer).not.toHaveBeenCalled();
  });

  it('the click after a drag is swallowed; the setting off starts no drag; no button down cancels', () => {
    const answer = vi.fn<Answer>();
    const { getByTestId, rerender } = render(<Board p={prompt(opts('a', 'b'), 1)} answer={answer} taps={(s) => [s]} enabled={false} />);
    stack(getByTestId('t1'));
    down(getByTestId('src'));
    ptr('pointermove', 30, 0);
    expect(document.querySelector('[data-part="ghost"]')).toBeNull();
    rerender(<Board p={prompt(opts('a', 'b'), 1)} answer={answer} taps={(s) => [s]} />);
    down(getByTestId('src'));
    ptr('pointermove', 30, 0);
    ptr('pointermove', 40, 0, 0);
    expect(document.querySelector('[data-part="ghost"]')).toBeNull();
    expect(answer).not.toHaveBeenCalled();
  });

  const animate = () => { const f = vi.fn(() => ({ cancel: vi.fn(), onfinish: null as null | (() => void), oncancel: null })); (HTMLElement.prototype as { animate?: unknown }).animate = f; return f; };
  const drag = (getByTestId: (id: string) => HTMLElement, upAt = 't1') => { stack(getByTestId(upAt)); down(getByTestId('src')); ptr('pointermove', 30, 0); };

  it('a source already armed: the drop taps only the target, same answer as a fresh drop', () => {
    const answer = vi.fn<Answer>();
    const { getByTestId } = render(<Board p={prompt(opts('a', 'b'))} answer={answer} />);
    fireEvent.click(getByTestId('src'));
    drag(getByTestId);
    ptr('pointerup', 30, 0);
    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith(['a', 'b'], 1);
  });

  it('confirm mode: an armed source stays armed and is never answered alone by a drop', () => {
    const answer = vi.fn<Answer>();
    const { getByTestId } = render(<Board p={prompt(opts('a', 'b'), 1)} answer={answer} confirm taps={(s) => [s]} />);
    fireEvent.click(getByTestId('src'));
    drag(getByTestId);
    ptr('pointerup', 30, 0);
    expect(answer).not.toHaveBeenCalled();
  });

  it('cancel on a prompt change, window blur and pointercancel: nothing answered', () => {
    const answer = vi.fn<Answer>();
    const { getByTestId, rerender } = render(<Board p={prompt(opts('a', 'b'))} answer={answer} />);
    drag(getByTestId);
    rerender(<Board p={{ ...prompt(opts('a', 'b')), id: 2 }} answer={answer} />);
    expect(document.querySelector('[data-part="ghost"]')).toBeNull();
    ptr('pointerup', 30, 0);
    drag(getByTestId);
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(document.querySelector('[data-part="ghost"]')).toBeNull();
    drag(getByTestId);
    act(() => { window.dispatchEvent(new Event('pointercancel')); });
    expect(document.querySelector('[data-part="ghost"]')).toBeNull();
    ptr('pointerup', 30, 0);
    expect(answer).not.toHaveBeenCalled();
  });

  it('the glide runs on an illegal drop and on Escape; the answer is sent before a settle ends', () => {
    const a = animate();
    const answer = vi.fn<Answer>();
    const { getByTestId } = render(<Board p={prompt(opts('a', 'b', '-c'))} answer={answer} speed={1} />);
    drag(getByTestId, 't2');
    ptr('pointerup', 30, 0);
    expect(a).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-part="ghost"]')).toHaveAttribute('data-flight', 'back');
    drag(getByTestId, 't1');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); });
    expect(a).toHaveBeenCalledTimes(2);
    ptr('pointerup', 30, 0);
    drag(getByTestId, 't1');
    ptr('pointerup', 30, 0);
    expect(answer).toHaveBeenCalledWith(['a', 'b'], 1);
    expect(a).toHaveBeenCalledTimes(3);
    expect(document.querySelector('[data-part="ghost"]')).toHaveAttribute('data-flight', 'settle');
  });

  it('no glide at speed 0 or with reduced motion', () => {
    const a = animate();
    const { getByTestId, rerender } = render(<Board p={prompt(opts('a', 'b', '-c'))} answer={vi.fn<Answer>()} speed={0} />);
    drag(getByTestId, 't2');
    ptr('pointerup', 30, 0);
    expect(a).not.toHaveBeenCalled();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    rerender(<Board p={prompt(opts('a', 'b', '-c'))} answer={vi.fn<Answer>()} speed={1} />);
    drag(getByTestId, 't2');
    ptr('pointerup', 30, 0);
    expect(a).not.toHaveBeenCalled();
    expect(document.querySelector('[data-part="ghost"]')).toBeNull();
  });
});

describe('drag-drop sourceLegal (K294)', () => {
  const C = ({ answer, sl }: { answer: Answer; sl: boolean }) => {
    const p = prompt(opts('slotA:c1'), 1);
    const pick = useBoardPick(p, answer, { confirm: false });
    const drag = useDragDrop({ pick, promptId: 1, speed: 'instant', taps: (s, t) => [t + ':' + s], ...(sl ? { sourceLegal: (id: string) => id === 'c1' } : {}) });
    return <div><button data-testid="src" {...drag.sourceProps('c1')}>c1</button><div data-testid="t" data-drop="slotA" /></div>;
  };
  it('a card drags with sourceLegal and answers slotA:c1; without it does not start', () => {
    const answer = vi.fn<Answer>();
    const { getByTestId, unmount } = render(<C answer={answer} sl />);
    stack(getByTestId('t'));
    down(getByTestId('src'));
    ptr('pointermove', 30, 0);
    ptr('pointerup', 30, 0);
    expect(answer).toHaveBeenCalledWith(['slotA:c1'], 1);
    unmount();
    answer.mockClear();
    const r = render(<C answer={answer} sl={false} />);
    stack(r.getByTestId('t'));
    down(r.getByTestId('src'));
    ptr('pointermove', 30, 0);
    ptr('pointerup', 30, 0);
    expect(answer).not.toHaveBeenCalled();
  });
});
