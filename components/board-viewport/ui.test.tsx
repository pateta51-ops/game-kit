// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BoardViewport, type BoardViewportHandle } from "./ui.ts";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function board(speed = 0, wheel?: "pan") {
  const ref = createRef<BoardViewportHandle>();
  const click = vi.fn();
  const result = render(
    <BoardViewport ref={ref} bounds={[0, 0, 400, 200]} speed={speed} wheel={wheel}>
      <button onClick={click}>Piece</button>
    </BoardViewport>,
  );
  return {
    ...result,
    ref,
    click,
    piece: result.getByRole("button"),
    root: result.container.firstElementChild!,
  };
}

it("allows a short drag to click a piece and suppresses the click after a pan", () => {
  const { ref, piece, click } = board();
  act(() => ref.current?.focus([100, 50, 100, 50]));
  const down = { pointerId: 1, button: 0, clientX: 50, clientY: 50 };
  fireEvent.pointerDown(piece, down);
  fireEvent.pointerMove(piece, { ...down, clientX: 53 });
  fireEvent.pointerUp(piece, down);
  fireEvent.click(piece, { detail: 1 });
  expect(click).toHaveBeenCalledOnce();
  expect(ref.current?.view.x).toBe(-200);

  fireEvent.pointerDown(piece, down);
  fireEvent.pointerMove(window, { ...down, clientX: 80 });
  fireEvent.pointerUp(piece, down);
  fireEvent.click(piece, { detail: 1 });
  expect(click).toHaveBeenCalledOnce();
  expect(ref.current?.view.x).toBe(-170);

  fireEvent.click(piece, { detail: 0 });
  expect(click).toHaveBeenCalledTimes(2);
});

it("zooms with a cancelable non-passive wheel and removes the exact listener on unmount", () => {
  const add = vi.spyOn(HTMLElement.prototype, "addEventListener");
  const { root, ref, unmount } = board();
  const remove = vi.spyOn(root, "removeEventListener");
  const wheel = () =>
    new WheelEvent("wheel", {
      deltaY: -100,
      cancelable: true,
      clientX: 80,
      clientY: 30,
    });
  const event = wheel();
  fireEvent(root, event);
  expect(event.defaultPrevented).toBe(true);
  expect(ref.current!.view.scale).toBeGreaterThan(0.5);
  const listener = add.mock.calls.find(
    ([type, , options]) =>
      type === "wheel" &&
      typeof options === "object" &&
      options.passive === false,
  );
  expect(listener).toBeDefined();
  unmount();
  expect(remove).toHaveBeenCalledWith("wheel", listener![1]);
  const detached = wheel();
  fireEvent(root, detached);
  expect(detached.defaultPrevented).toBe(false);
});

it("animates focus from the current view and fits immediately", () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window.performance, "now").mockReturnValue(100);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
    frames.push(callback),
  );
  const { ref } = board(1);
  act(() => ref.current?.focus([100, 50, 100, 50]));
  expect(ref.current?.view.scale).toBe(0.5);
  act(() => frames.shift()!(275));
  expect(ref.current?.view.scale).toBe(1.25);
  act(() => frames.shift()!(450));
  expect(ref.current?.view.scale).toBe(2);
  act(() => ref.current?.fit());
  expect(ref.current?.view.scale).toBe(0.5);
});

const touchDown = (id: number, x = 50) => ({
  pointerId: id,
  pointerType: 'touch',
  button: 0,
  clientX: x,
  clientY: 50,
});

it('clicks a piece after a mouse release outside left a stale contact', () => {
  const { piece, click } = board();
  const mouse = { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 };
  fireEvent.pointerDown(piece, { ...mouse, clientX: 50, clientY: 50 });
  fireEvent.pointerDown(piece, { ...mouse, pointerId: 2, clientX: 50 });
  fireEvent.pointerUp(piece, { ...mouse, pointerId: 2, buttons: 0 });
  fireEvent.click(piece, { detail: 1 });
  expect(click).toHaveBeenCalledOnce();
});

it('clicks a piece after a touch that ended in pointercancel', () => {
  const { piece, click } = board();
  fireEvent.pointerDown(piece, touchDown(1));
  fireEvent.pointerCancel(window, touchDown(1));
  fireEvent.pointerDown(piece, touchDown(2));
  fireEvent.pointerUp(piece, touchDown(2));
  fireEvent.click(piece, { detail: 1 });
  expect(click).toHaveBeenCalledOnce();
});

it('clicks a piece after a two-finger touch with no movement', () => {
  const { piece, click } = board();
  fireEvent.pointerDown(piece, touchDown(1));
  fireEvent.pointerDown(piece, touchDown(2, 80));
  fireEvent.pointerUp(piece, touchDown(2, 80));
  fireEvent.pointerUp(piece, touchDown(1));
  fireEvent.click(piece, { detail: 1 });
  expect(click).toHaveBeenCalledOnce();
});

it('clicks a piece when a stale touch contact is older than the timeout', () => {
  const { piece, click } = board();
  fireEvent.pointerDown(piece, touchDown(1));
  vi.spyOn(Event.prototype, 'timeStamp', 'get').mockReturnValue(99999);
  fireEvent.pointerDown(piece, touchDown(2));
  fireEvent.pointerUp(piece, touchDown(2));
  fireEvent.click(piece, { detail: 1 });
  expect(click).toHaveBeenCalledOnce();
});

it("K709 wheel pan: the wheel moves y and keeps the scale, shift or deltaX moves x, ctrl zooms; default zooms", () => {
  const send = (root: Element, init: WheelEventInit) => {
    const e = new WheelEvent("wheel", { cancelable: true, clientX: 80, clientY: 30, ...init });
    fireEvent(root, e);
    return e;
  };
  const tall = (wheel?: "pan") => {
    const b = board(0, wheel);
    act(() => b.ref.current?.focus([0, 0, 200, 200]));
    act(() => b.ref.current?.focus([0, 0, 100, 50]));
    return b;
  };
  const { root, ref } = tall("pan");
  const before = { ...ref.current!.view };
  const e = send(root, { deltaY: 20 });
  expect(e.defaultPrevented).toBe(true);
  expect(ref.current!.view.scale).toBe(before.scale);
  expect(ref.current!.view.y).toBeLessThan(before.y);
  expect(ref.current!.view.x).toBe(before.x);
  const y1 = ref.current!.view.y;
  send(root, { deltaY: -5 });
  expect(ref.current!.view.y).toBe(y1 + 5);
  send(root, { deltaY: 10, shiftKey: true });
  expect(ref.current!.view.y).toBe(y1 + 5);
  expect(ref.current!.view.x).toBeLessThan(before.x);
  const x1 = ref.current!.view.x;
  send(root, { deltaX: 3 });
  expect(ref.current!.view.x).toBe(x1 - 3);
  send(root, { deltaY: -100, ctrlKey: true });
  expect(ref.current!.view.scale).not.toBe(before.scale);

  const plain = tall();
  const s0 = plain.ref.current!.view.scale;
  send(plain.root, { deltaY: -100 });
  expect(plain.ref.current!.view.scale).not.toBe(s0);
});
