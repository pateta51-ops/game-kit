import { useRef, type CSSProperties, type ReactNode } from "react";
import type { DiagramAsset, Scene, SceneElement } from "./rulebook.ts";

export type RenderAsset = (
  asset: DiagramAsset,
  context: "inline" | "enlarged",
) => ReactNode;
type RenderText = (text: string) => ReactNode;

const pct = (value: number, of: number) => `${String((value / of) * 100)}%`;
const cq = (scene: Scene, value: number) =>
  `${String((value / scene.w) * 100)}cqw`;

function place(
  scene: Scene,
  x: number,
  y: number,
  w?: number,
  h?: number,
): CSSProperties {
  return {
    position: "absolute",
    left: pct(x - (scene.x0 ?? 0), scene.w),
    top: pct(y - (scene.y0 ?? 0), scene.h),
    width: w === undefined ? undefined : pct(w, scene.w),
    height: h === undefined ? undefined : pct(h, scene.h),
  };
}

function layer(scene: Scene, over: boolean) {
  const unit = scene.w / 300;
  const dash = `${String(unit * 5)} ${String(unit * 3)}`;
  return (
    <svg
      data-part={over ? "overlay" : "underlay"}
      viewBox={[scene.x0 ?? 0, scene.y0 ?? 0, scene.w, scene.h].join(" ")}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {scene.els.map((el, index) => {
        if (over && el.t === "line")
          return (
            <line
              key={index}
              x1={el.from[0]}
              y1={el.from[1]}
              x2={el.to[0]}
              y2={el.to[1]}
              stroke="var(--rules-line, currentColor)"
              strokeWidth={unit * 1.1}
            />
          );
        if (!over && el.t === "poly")
          return (
            <polygon
              key={index}
              points={el.points.map((p) => p.join(",")).join(" ")}
              fill="var(--rules-area, transparent)"
              stroke="var(--rules-line, currentColor)"
              strokeWidth={unit * 0.8}
            />
          );
        if (over ? el.t !== "box" : el.t !== "zone") return null;
        if (el.t !== "box" && el.t !== "zone") return null;
        const filled = el.t === "zone" && el.style === "fill";
        return (
          <rect
            key={index}
            data-part={el.t}
            x={el.x}
            y={el.y}
            width={el.w}
            height={el.h}
            fill={filled ? "var(--rules-area, transparent)" : "none"}
            stroke="var(--rules-line, currentColor)"
            strokeWidth={unit * (filled ? 0.8 : 1.4)}
            strokeDasharray={filled ? undefined : dash}
          />
        );
      })}
    </svg>
  );
}

function assetElement(
  scene: Scene,
  el: Extract<SceneElement, { t: "asset" }>,
  face: ReactNode,
) {
  const [l, t, r, b] = el.crop ?? [0, 0, 1, 1];
  const { x, y, w, h } = el;
  return Array.from({ length: (el.stack ?? 0) + 1 }, (_, index) => {
    const offset = ((el.stack ?? 0) - index) * w * 0.03;
    return (
      <div
        key={index}
        data-part="asset"
        data-asset={el.asset.id}
        style={{
          ...place(
            scene,
            x + l * w + offset,
            y + t * h + offset,
            (r - l) * w,
            (b - t) * h,
          ),
          overflow: "hidden",
          rotate: el.rot === undefined ? undefined : `${String(el.rot)}deg`,
          transformOrigin: `${pct(0.5 - l, r - l)} ${pct(0.5 - t, b - t)}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: pct(-l, r - l),
            top: pct(-t, b - t),
            width: pct(1, r - l),
            height: pct(1, b - t),
          }}
        >
          {face}
        </div>
      </div>
    );
  });
}

export function RuleScene({
  scene,
  renderAsset,
  renderText,
  context = "inline",
}: {
  scene: Scene;
  renderAsset: RenderAsset;
  renderText: RenderText;
  context?: "inline" | "enlarged";
}) {
  return (
    <div
      data-part="scene"
      data-scene={scene.id}
      role="img"
      aria-label={scene.alt}
      style={{
        position: "relative",
        overflow: "hidden",
        containerType: "inline-size",
        aspectRatio: scene.w / scene.h,
      }}
    >
      {layer(scene, false)}
      {scene.els.map(
        (el, index) =>
          el.t === "asset" && (
            <div key={index}>
              {assetElement(scene, el, renderAsset(el.asset, context))}
            </div>
          ),
      )}
      {layer(scene, true)}
      {scene.els.map((el, index) => {
        switch (el.t) {
          case "label":
            return (
              <div
                key={index}
                data-part="label"
                style={{
                  ...place(scene, el.x, el.y),
                  fontSize: cq(scene, el.size),
                  textAlign: el.align,
                  whiteSpace: "pre",
                  translate:
                    el.align === "center"
                      ? "-50%"
                      : el.align === "right"
                        ? "-100%"
                        : undefined,
                }}
              >
                {el.text}
                {el.icon && (
                  <div>
                    {renderAsset({ kind: "icon", id: el.icon }, context)}
                  </div>
                )}
              </div>
            );
          case "plate":
            return (
              <div
                key={index}
                data-part="plate"
                style={{
                  ...place(scene, el.x, el.y, el.w, el.h),
                  fontSize: cq(scene, el.h * 0.36),
                }}
              >
                <b>{el.count}</b> {renderText(el.text)}
              </div>
            );
          case "letter":
            return (
              <div
                key={index}
                data-part="marker"
                style={{
                  ...place(scene, el.x - el.r, el.y - el.r, 2 * el.r, 2 * el.r),
                  fontSize: cq(scene, el.r * 1.45),
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {el.text}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export function Enlargement({
  label,
  close,
  describedBy,
  children,
  large,
}: {
  label: string;
  close: string;
  describedBy?: string;
  children: ReactNode;
  large: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        data-part="enlarge"
        aria-label={label}
        aria-describedby={describedBy}
        onClick={() => dialog.current?.showModal()}
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        data-part="enlargement"
        aria-label={label}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div data-part="enlarged-content">
          <button type="button" onClick={() => dialog.current?.close()}>
            {close}
          </button>
          {large}
        </div>
      </dialog>
    </>
  );
}
