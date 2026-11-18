export type Point = readonly [x: number, y: number];
export type Size = readonly [width: number, height: number];
export type Rect = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
];
export type View = Readonly<{ x: number; y: number; scale: number }>;

export type ViewLimits = {
  size: Size;
  bounds: Rect;
  minScale: number;
  maxScale: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function clampAxis(
  offset: number,
  size: number,
  start: number,
  length: number,
  scale: number,
) {
  const spare = size - length * scale;
  return (
    (spare >= 0 ? spare / 2 : clamp(offset + start * scale, spare, 0)) -
    start * scale
  );
}

export function clampView(
  view: View,
  { size, bounds, minScale, maxScale }: ViewLimits,
): View {
  const scale = clamp(view.scale, minScale, maxScale);
  return {
    x: clampAxis(view.x, size[0], bounds[0], bounds[2], scale),
    y: clampAxis(view.y, size[1], bounds[1], bounds[3], scale),
    scale,
  };
}

export function zoomAbout(
  view: View,
  factor: number,
  [x, y]: Point,
  limits: ViewLimits,
): View {
  const scale = clamp(view.scale * factor, limits.minScale, limits.maxScale);
  const ratio = scale / view.scale;
  return clampView(
    { x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio, scale },
    limits,
  );
}

export function fitRect([x, y, width, height]: Rect, limits: ViewLimits): View {
  const [w, h] = limits.size;
  const scale = clamp(
    Math.min(w / width, h / height),
    limits.minScale,
    limits.maxScale,
  );
  return clampView(
    {
      x: (w - width * scale) / 2 - x * scale,
      y: (h - height * scale) / 2 - y * scale,
      scale,
    },
    limits,
  );
}

export function tweenView(
  from: View,
  to: View,
  elapsedMs: number,
  speed = 1,
): View {
  const t = speed <= 0 ? 1 : clamp(elapsedMs / (350 * speed), 0, 1);
  if (t === 1) return to;
  if (t === 0) return from;
  const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const mix = (a: number, b: number) => a + (b - a) * eased;
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    scale: mix(from.scale, to.scale),
  };
}
