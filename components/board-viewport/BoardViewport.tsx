import { useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { clampView, fitRect, tweenView, zoomAbout } from "./index.ts";
import type { Point, Rect, View, ViewLimits } from "./index.ts";

export interface BoardViewportHandle {
  readonly view: View;
  fit(): void;
  focus(rect: Rect): void;
}

export interface BoardViewportProps {
  bounds: Rect;
  minScale?: number;
  maxScale?: number;
  speed?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  ref?: Ref<BoardViewportHandle>;
}

const initialView: View = { x: 0, y: 0, scale: 1 };
const DRAG_THRESHOLD = 5;
const STALE_MS = 1500;
type Contact = { start: Point; point: Point; time: number };

export function BoardViewport({
  bounds: [x, y, width, height],
  minScale,
  maxScale,
  speed = 1,
  className,
  style,
  children,
  ref,
}: BoardViewportProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const current = useRef(initialView);
  const [view, setView] = useState(initialView);
  const camera = useRef<{ fit(): void; focus(rect: Rect): void }>(null);

  useImperativeHandle(
    ref,
    () => ({
      get view() {
        return current.current;
      },
      fit: () => camera.current?.fit(),
      focus: (rect) => camera.current?.focus(rect),
    }),
    [],
  );

  const motionSpeed = useRef(speed);
  useLayoutEffect(() => {
    motionSpeed.current = speed;
  }, [speed]);

  useLayoutEffect(() => {
    const el = viewport.current!;
    const win = el.ownerDocument.defaultView!;
    const bounds: Rect = [x, y, width, height];
    const limits = (): ViewLimits | undefined => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      const fitted = Math.min(w / width, h / height);
      const min = minScale ?? fitted;
      return {
        size: [w, h],
        bounds,
        minScale: min,
        maxScale: Math.max(min, maxScale ?? 8 * fitted),
      };
    };
    let frame = 0;
    let target: Rect = bounds;
    const stop = () => win.cancelAnimationFrame(frame);
    const show = (next: View) => {
      current.current = next;
      setView(next);
    };
    const fit = () => {
      stop();
      const range = limits();
      target = bounds;
      if (range) show(fitRect(bounds, range));
    };
    const focus = (rect: Rect) => {
      stop();
      target = rect;
      const range = limits();
      if (!range) return;
      const from = current.current;
      const to = fitRect(rect, range);
      const speed = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? 0
        : motionSpeed.current;
      if (speed <= 0) {
        show(to);
        return;
      }
      const start = win.performance.now();
      function step(now: number) {
        const next = tweenView(from, to, now - start, speed);
        show(clampView(next, range!));
        if (next !== to) frame = win.requestAnimationFrame(step);
      }
      frame = win.requestAnimationFrame(step);
    };
    camera.current = { fit, focus };

    // Convert client coordinates through any scaling applied by the game's stage.
    const local = ([cx, cy]: Point): Point => {
      const box = el.getBoundingClientRect();
      return [
        (cx - box.left) * (box.width ? el.offsetWidth / box.width : 1) -
          el.clientLeft,
        (cy - box.top) * (box.height ? el.offsetHeight / box.height : 1) -
          el.clientTop,
      ];
    };
    const wheel = (event: WheelEvent) => {
      const range = limits();
      if (!range) return;
      event.preventDefault();
      stop();
      const unit =
        event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? range.size[1] : 1;
      show(
        zoomAbout(
          current.current,
          1.0015 ** (-event.deltaY * unit),
          local([event.clientX, event.clientY]),
          range,
        ),
      );
    };

    const contacts = new Map<number, Contact>();
    let dragging = false;
    let suppressClick = false;
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (event.pointerType !== "touch") contacts.clear();
      for (const [id, c] of contacts)
        if (event.timeStamp - c.time > STALE_MS) contacts.delete(id);
      if (
        contacts.size === 2 ||
        (contacts.size && event.pointerType !== "touch")
      )
        return;
      stop();
      if (!contacts.size) {
        dragging = false;
        suppressClick = false;
      }
      const point: Point = [event.clientX, event.clientY];
      contacts.set(event.pointerId, {
        start: point,
        point,
        time: event.timeStamp,
      });
    };
    const move = (event: PointerEvent) => {
      const contact = contacts.get(event.pointerId);
      const range = limits();
      if (!contact || !range) return;
      const point: Point = [event.clientX, event.clientY];
      if (
        !dragging &&
        Math.hypot(point[0] - contact.start[0], point[1] - contact.start[1]) <
          DRAG_THRESHOLD
      )
        return;
      dragging = true;
      stop();
      const [ax, ay] = local(contact.point);
      const [bx, by] = local(point);
      const other = [...contacts.values()].find((entry) => entry !== contact);
      contact.point = point;
      contact.time = event.timeStamp;
      const view = current.current;
      if (other) {
        const [ox, oy] = local(other.point);
        const distance = Math.hypot(ax - ox, ay - oy);
        const center: Point = [(ax + ox) / 2, (ay + oy) / 2];
        // Clamp the scale before translating so a pinch can move away from a board edge.
        const scale = Math.min(
          range.maxScale,
          Math.max(
            range.minScale,
            distance
              ? (view.scale * Math.hypot(bx - ox, by - oy)) / distance
              : view.scale,
          ),
        );
        const ratio = scale / view.scale;
        show(
          clampView(
            {
              x: center[0] - (center[0] - view.x) * ratio + (bx - ax) / 2,
              y: center[1] - (center[1] - view.y) * ratio + (by - ay) / 2,
              scale,
            },
            range,
          ),
        );
        return;
      }
      show(
        clampView({ ...view, x: view.x + bx - ax, y: view.y + by - ay }, range),
      );
    };
    const up = (event: PointerEvent) => {
      const had = contacts.delete(event.pointerId);
      if (
        event.type === "pointercancel" ||
        (event.pointerType !== "touch" && !event.buttons)
      )
        contacts.clear();
      if (had && dragging && event.type !== "pointercancel")
        suppressClick = true;
    };
    const blur = () => contacts.clear();
    const click = (event: MouseEvent) => {
      if (!suppressClick || !event.detail) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("pointerdown", down);
    el.addEventListener("click", click, true);
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", up);
    win.addEventListener("pointercancel", up);
    win.addEventListener("blur", blur);
    let previousWidth = el.clientWidth;
    let previousHeight = el.clientHeight;
    const resize = new ResizeObserver(() => {
      if (
        el.clientWidth === previousWidth &&
        el.clientHeight === previousHeight
      )
        return;
      previousWidth = el.clientWidth;
      previousHeight = el.clientHeight;
      stop();
      const range = limits();
      if (range) show(fitRect(target, range));
    });
    resize.observe(el);
    fit();
    return () => {
      stop();
      resize.disconnect();
      camera.current = null;
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("click", click, true);
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", up);
      win.removeEventListener("pointercancel", up);
      win.removeEventListener("blur", blur);
    };
  }, [x, y, width, height, minScale, maxScale]);

  return (
    <div
      ref={viewport}
      className={className}
      style={{
        ...style,
        position: "relative",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "max-content",
          transformOrigin: "0 0",
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
