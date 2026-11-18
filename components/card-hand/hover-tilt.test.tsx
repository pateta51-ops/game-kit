import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardHand } from "./ui.tsx";

const props = {
  view: { cards: ["a", "b"] },
  face: (id: string) => <b>{id}</b>,
};
const tilt = { maxDeg: 5, lift: 8, speed: 1 };
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  frames = new Map();
  let next = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function move(strip: Element, x: number, pointerType = "mouse"): void {
  const event = new MouseEvent("pointermove", {
    bubbles: true,
    clientX: x,
    clientY: 70,
  });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(strip, event);
}

function frame(): void {
  act(() => {
    for (const [id, callback] of frames) {
      frames.delete(id);
      callback(0);
    }
  });
}

function hand(speed = 1, tiltSpeed = 1) {
  const result = render(
    <CardHand
      {...props}
      speed={speed}
      hoverTilt={{ ...tilt, speed: tiltSpeed }}
    />,
  );
  const face =
    result.container.querySelector<HTMLElement>('[data-part="face"]')!;
  const leaner = face.querySelector<HTMLElement>('[data-part="tilt"]')!;
  const strip = result.container.querySelector('[data-part="strip"]')!;
  const measure = vi.spyOn(face, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 100,
    height: 140,
  } as DOMRect);
  return { ...result, strip, leaner, measure };
}

describe("card-hand hover tilt", () => {
  it("batches moves, leans right at the edge and returns to zero in the centre", () => {
    const { strip, leaner, measure } = hand();
    move(strip, 90);
    move(strip, 100);
    expect(frames.size).toBe(1);
    frame();
    expect(leaner.style.getPropertyValue("--hand-tilt-y")).toBe("5deg");
    expect(leaner.style.getPropertyValue("--hand-tilt-nx")).toBe("1");
    expect(leaner.style.getPropertyValue("--hand-tilt-lift")).toBe("8px");
    move(strip, 50);
    frame();
    expect(leaner.style.getPropertyValue("--hand-tilt-y")).toBe("0deg");
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("clears the pose when the pointer leaves the card within the hand", () => {
    const { strip, leaner, container } = hand();
    move(strip, 100);
    frame();
    move(container.querySelector('[data-part="fan"]')!, 107);
    expect(leaner.hasAttribute("data-tilting")).toBe(false);
    expect(leaner.getAttribute("style")).toBe("");
  });

  it("keeps the tilt up to six pixels outside the face, even outside the hand", () => {
    const { strip, leaner } = hand();
    move(strip, 99);
    frame();
    move(document.body, 106);
    frame();
    expect(leaner.hasAttribute("data-tilting")).toBe(true);
    expect(leaner.style.getPropertyValue("--hand-tilt-y")).toBe("5deg");
    move(document.body, 107);
    expect(leaner.hasAttribute("data-tilting")).toBe(false);
  });

  it.each([
    [0, 1],
    [1, 0],
  ])(
    "sets no motion at hand speed %s and tilt speed %s",
    (speed, tiltSpeed) => {
      const { strip, leaner, container } = hand(speed, tiltSpeed);
      move(strip, 100);
      expect(frames.size).toBe(0);
      expect(leaner.getAttribute("style")).toBeNull();
      expect(
        container.querySelector('[data-part="hand"]')!.getAttribute("style"),
      ).not.toContain("--hand-tilt-ms");
    },
  );

  it("ignores touch", () => {
    const { strip, leaner } = hand();
    move(strip, 100, "touch");
    expect(frames.size).toBe(0);
    expect(leaner.hasAttribute("data-tilting")).toBe(false);
  });

  it("removes tracking listeners and cancels a queued frame on unmount", () => {
    const add = vi.spyOn(EventTarget.prototype, "addEventListener");
    const remove = vi.spyOn(EventTarget.prototype, "removeEventListener");
    const addWindow = vi.spyOn(window, "addEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const { container, strip, unmount } = hand();
    const root = container.querySelector('[data-part="hand"]');
    const listeners = add.mock.calls.flatMap(([type, listener], index) => {
      const target = add.mock.contexts[index];
      return target === root ||
        (target === document && type === "pointermove") ||
        (target === document.documentElement && type === "pointerleave")
        ? [{ target, type, listener }]
        : [];
    });
    expect(listeners.map(({ type }) => type)).toEqual([
      "pointermove",
      "pointerleave",
      "pointerdown",
      "pointercancel",
      "transitionend",
    ]);
    expect(addWindow.mock.calls.map(([type]) => type)).toEqual([
      "resize",
      "scroll",
      "blur",
    ]);
    move(strip, 100);
    unmount();
    expect(frames.size).toBe(0);
    for (const [type, listener] of addWindow.mock.calls) {
      expect(
        removeWindow.mock.calls.some(
          ([name, callback]) => name === type && callback === listener,
        ),
      ).toBe(true);
    }
    for (const { target, type, listener } of listeners) {
      expect(
        remove.mock.calls.some(
          ([name, callback], index) =>
            remove.mock.contexts[index] === target &&
            name === type &&
            callback === listener,
        ),
      ).toBe(true);
    }
  });

  it("leaves the original face structure in place by default", () => {
    const { container } = render(<CardHand {...props} />);
    expect(container.querySelector('[data-part="tilt"]')).toBeNull();
  });
});
