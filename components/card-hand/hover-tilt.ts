// Pointer tracking and cached flat-face bounds adapted from Unstoppable a9b3dfb.
export interface HoverTilt {
  readonly maxDeg?: number;
  readonly lift?: number;
  readonly speed?: number;
}

const CARD = '[data-part="card"]';
const KEEP_PX = 6;
const clamp = (value: number): number => Math.max(-1, Math.min(1, value));

export function bindHoverTilt(
  root: HTMLElement,
  { maxDeg = 6, lift = 8, speed = 1 }: HoverTilt,
): () => void {
  if (
    speed <= 0 ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  )
    return () => undefined;

  let face: HTMLElement | null = null;
  let leaner: HTMLElement | null = null;
  let rect: DOMRect | null = null;
  let x = 0;
  let y = 0;
  let frame: number | null = null;
  const settle = (): void => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    leaner?.removeAttribute("data-tilting");
    for (const name of [
      "--hand-tilt-x",
      "--hand-tilt-y",
      "--hand-tilt-lift",
      "--hand-tilt-nx",
      "--hand-tilt-ny",
    ])
      leaner?.style.removeProperty(name);
    face = leaner = rect = null;
  };
  const apply = (): void => {
    frame = null;
    if (face === null || leaner === null) return;
    if (!root.contains(face)) {
      settle();
      return;
    }
    rect ??= face.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = clamp(((x - rect.left) / rect.width) * 2 - 1);
    const ny = clamp(((y - rect.top) / rect.height) * 2 - 1);
    const scale = Math.max(0, maxDeg) / Math.max(1, Math.hypot(nx, ny));
    leaner.style.setProperty("--hand-tilt-x", `${String(ny * scale)}deg`);
    leaner.style.setProperty("--hand-tilt-y", `${String(nx * scale)}deg`);
    leaner.style.setProperty("--hand-tilt-nx", String(nx));
    leaner.style.setProperty("--hand-tilt-ny", String(ny));
    leaner.style.setProperty(
      "--hand-tilt-lift",
      `${String(Math.max(0, lift))}px`,
    );
    leaner.setAttribute("data-tilting", "");
  };
  const schedule = (): void => {
    frame ??= window.requestAnimationFrame(apply);
  };
  const cardOf = (target: EventTarget | null): Element | null =>
    target instanceof Element ? target.closest(CARD) : null;
  const move = (event: PointerEvent): void => {
    if (event.pointerType === "touch" || event.buttons !== 0) return;
    const targetCard = cardOf(event.target);
    const card =
      targetCard?.parentElement?.parentElement === root ? targetCard : null;
    x = event.clientX;
    y = event.clientY;
    const kept =
      card === null &&
      face !== null &&
      root.contains(face) &&
      rect !== null &&
      x >= rect.left - KEEP_PX &&
      x <= rect.left + rect.width + KEEP_PX &&
      y >= rect.top - KEEP_PX &&
      y <= rect.top + rect.height + KEEP_PX;
    if (card !== face?.parentElement && !kept) {
      settle();
      if (card === null || card.hasAttribute("data-dragging")) return;
      face = card.querySelector(':scope > [data-part="face"]');
      leaner = face?.querySelector(':scope > [data-part="tilt"]') ?? null;
    }
    if (leaner === null) return;
    schedule();
  };
  const invalidate = (): void => {
    rect = null;
    if (face !== null) schedule();
  };
  const transitioned = (event: TransitionEvent): void => {
    if (event.target === face && event.propertyName === "transform")
      invalidate();
  };
  root.style.setProperty("--hand-tilt-ms", `${String(160 / speed)}ms`);
  document.addEventListener("pointermove", move, { passive: true });
  document.documentElement.addEventListener("pointerleave", settle);
  root.addEventListener("pointerdown", settle);
  root.addEventListener("pointercancel", settle);
  root.addEventListener("transitionend", transitioned);
  window.addEventListener("resize", invalidate);
  window.addEventListener("scroll", invalidate, {
    capture: true,
    passive: true,
  });
  window.addEventListener("blur", settle);
  return () => {
    settle();
    root.style.removeProperty("--hand-tilt-ms");
    document.removeEventListener("pointermove", move);
    document.documentElement.removeEventListener("pointerleave", settle);
    root.removeEventListener("pointerdown", settle);
    root.removeEventListener("pointercancel", settle);
    root.removeEventListener("transitionend", transitioned);
    window.removeEventListener("resize", invalidate);
    window.removeEventListener("scroll", invalidate, true);
    window.removeEventListener("blur", settle);
  };
}
