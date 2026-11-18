// K396: the top-view riffle (the halves split, riffle in, bridge, square up and are tapped), drawn on one canvas: WebGL2
// strips, or 2D canvas strips without WebGL2. Ported from the approved riffle study (game-kit branch riffle-preview 610c8d6,
// tuners/src/riffle-top.mjs).
import { animatePile, ease, mix, phase, type PileMotion } from './riffle-surface.ts';

/** A card back for the top view: a draw function on a 2D context sized to the card, or an image. */
export type TopBack = ((ctx: CanvasRenderingContext2D, width: number, height: number) => void) | CanvasImageSource;
export interface RiffleTopOpts {
  speed?: number;
  cards?: number;
  orientation?: 'portrait' | 'landscape' | undefined;
  /** Seconds at speed 1: split, riffle, bridge, square. */
  durations?: readonly number[];
  back?: TopBack;
}
interface Strips {
  quad(x: number, y: number, dx: number, dy: number, vx: number, vy: number, u0: number, u1: number, left: number, right: number): void;
  flush(): void;
  clear?: () => void;
}

const segments = 10;
function dealOrder(count: number) {
  let seed = 82;
  const random = () => {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    return seed / 4294967296;
  };
  const remaining = [Math.ceil(count / 2), Math.floor(count / 2)];
  const levels = [0, 0];
  let hand = 1;
  let beat = 0;
  const order: { hand: number; level: number; beat: number }[] = [];
  while (order.length < count) {
    hand = 1 - hand;
    const run = Math.min(remaining[hand]!, random() < 0.36 ? 2 : 1);
    remaining[hand]! -= run;
    for (let i = 0; i < run; i++) {
      order.push({ hand, level: levels[hand]!++, beat });
      beat += 0.55 + random() * 0.9;
    }
  }
  return order.map((entry) => ({ ...entry, beat: entry.beat / beat }));
}
export function riffleTop(deck: HTMLElement, {
  speed = 1,
  cards = 20,
  orientation,
  durations = [0.45, 1.35, 0.75, 0.45],
  back = drawNeutralBack,
}: RiffleTopOpts = {}): PileMotion {
  const [enter = 0, release = 0, bridge = 0, exit = 0] = durations;
  return animatePile(deck, { speed, durations, trackPosition: false }, (layer, rect) => {
    const dpr = layer.ownerDocument.defaultView!.devicePixelRatio;
    const width = Math.round(rect.width * dpr) / dpr;
    const height = Math.round(rect.height * dpr) / dpr;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const shiftX = Math.round(rect.left) + width / 2 - cx;
    const shiftY = Math.round(rect.top) + height / 2 - cy;
    const landscape = orientation ? orientation.toLowerCase() === 'landscape' : width > height;
    const unit = Math.min(width, height);
    const tilt = landscape ? 9 : 14;
    const count = Math.max(2, Math.round(cards));
    const pitch = unit * 0.092 / (count - 1);
    const document = layer.ownerDocument;
    const pad = 2;
    const face = bitmap(document, width + 2 * pad, height + 2 * pad, dpr, (paint) => {
      paint.translate(pad, pad);
      if (typeof back === 'function') back(paint, width, height);
      else paint.drawImage(back, 0, 0, width, height);
    });
    const shadows = [0, 1].map(() => {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'absolute',
        width: `${String(width * 1.38)}px`,
        height: `${String(height * 1.32)}px`,
        left: `${String(shiftX - width * 0.69)}px`,
        top: `${String(shiftY - height * 0.61)}px`,
        background: 'radial-gradient(ellipse closest-side, #080809df 35%, transparent)',
        willChange: 'transform, opacity',
      });
      layer.append(el);
      return el;
    });
    const packet = dealOrder(count);
    const step = width / segments;
    const radius = width * 0.62;
    const archHeight = height * 0.39;
    const bounds = [Infinity, Infinity, -Infinity, -Infinity] as [number, number, number, number];
    const corner = (px: number, py: number) => {
      bounds[0] = Math.min(bounds[0], px);
      bounds[1] = Math.min(bounds[1], py);
      bounds[2] = Math.max(bounds[2], px);
      bounds[3] = Math.max(bounds[3], py);
    };
    let draw: Strips = {
      quad(x, y, dx, dy, vx, vy) {
        corner(x, y);
        corner(x + dx, y + dy);
        corner(x + vx, y + vy);
        corner(x + dx + vx, y + dy + vy);
      },
      flush() {},
    };
    const total = durations.reduce((sum, value) => sum + value, 0);
    for (let sample = 0; sample <= 240; sample++) frame(total * sample / 240);
    const left = Math.floor(cx + shiftX + bounds[0] - pad - 2) - cx;
    const top = Math.floor(cy + shiftY + bounds[1] - pad - 2) - cy;
    const overlayWidth = Math.ceil(cx + shiftX + bounds[2] + pad + 2) - cx - left;
    const overlayHeight = Math.ceil(cy + shiftY + bounds[3] + pad + 2) - cy - top;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(overlayWidth * dpr);
    canvas.height = Math.round(overlayHeight * dpr);
    Object.assign(canvas.style, { position: 'absolute', left: `${String(left)}px`, top: `${String(top)}px`, width: `${String(overlayWidth)}px`, height: `${String(overlayHeight)}px` });
    layer.append(canvas);
    draw = stripRenderer(canvas, left - shiftX, top - shiftY, overlayWidth, overlayHeight, face, count * segments, width, height, pad);
    return frame;
    function frame(time: number) {
      draw.clear?.();
      const split = ease(phase(time, enter));
      const drop = phase(time - enter, release);
      const archTime = phase(time - enter - release, bridge);
      const settle = phase(time - enter - release - bridge, exit);
      const press = ease(archTime / 0.32);
      const square = ease(settle / 0.52);
      const tapTime = phase(settle - 0.52, 0.48);
      const tap = Math.sin(Math.PI * tapTime) * Math.cos(2 * Math.PI * tapTime);
      const offset = width * split * mix(0.53, 0.16, ease(drop)) * (1 - square);
      for (let hand = 0; hand < 2; hand++) {
        shadows[hand]!.style.transform = `translate(${String((hand * 2 - 1) * offset)}px, ${String(unit * 0.08 * press * (1 - square))}px)`;
        shadows[hand]!.style.opacity = String(mix(0.93, 0.66, press * (1 - square)));
      }
      for (let index = 0; index < count; index++) {
        const { hand, level, beat } = packet[index]!;
        const side = hand * 2 - 1;
        const fall = ease((drop - 0.04 - beat * 0.72) / 0.22);
        const roll = 1 - ease((archTime - 0.34 - beat * 0.41) / 0.24);
        const arch = press * roll;
        const curl = split * (1 - fall) * unit * (0.29 + 0.1 * level / count);
        const flutter = unit * 0.045 * Math.sin(fall * Math.PI * 2) * Math.sin(fall * Math.PI);
        const x = side * width * split * mix(0.53, mix(0.2, 0.115, press), fall) * (1 - square);
        const stack = mix(index, level, split * (1 - fall)) * pitch;
        const shear = (index / (count - 1) - 0.5) * unit * 0.25 * arch;
        const y = (count - 1) * pitch - stack + (split * mix(height * 0.045, height * 0.019, fall) * side + shear) * (1 - square);
        const angle = -side * tilt * split * mix(1, 0.21, fall) * (1 - press * 0.7) * (1 - square);
        const radians = angle * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const tx = x + tap * unit * 0.029;
        const ty = y + tap * unit * 0.042;
        if (Math.abs(curl + flutter) < 1e-8 && arch === 0) {
          draw.quad(tx - cos * width / 2 + sin * height / 2, ty - sin * width / 2 - cos * height / 2,
            cos * width, sin * width, -sin * height, cos * height, 0, 1, 0, 0);
          continue;
        }
        const curve = curl + flutter;
        const crown = archHeight * arch;
        let left = -width / 2;
        let z = bend(left, side, width, x, radius, curve, crown);
        let halfBefore = bend(left - step / 2, side, width, x, radius, curve, crown);
        let half = bend(left + step / 2, side, width, x, radius, curve, crown);
        for (let segment = 0; segment < segments; segment++) {
          const local = -width / 2 + segment * step;
          const next = bend(local + step, side, width, x, radius, curve, crown);
          const halfAfter = bend(local + step * 1.5, side, width, x, radius, curve, crown);
          const rise = next - z;
          const span = Math.sqrt(step ** 2 - Math.min(step * 0.86, Math.abs(rise)) ** 2);
          const slant = -rise * 0.49 / step;
          const squash = span / step;
          const lift = -z * 0.49;
          const slice = step + (segment === segments - 1 ? 0 : 0.35);
          draw.quad(tx + cos * left - sin * (lift - height / 2), ty + sin * left + cos * (lift - height / 2),
            (cos * squash - sin * slant) * slice, (sin * squash + cos * slant) * slice,
            -sin * height, cos * height, segment / segments, segment / segments + slice / width,
            shade((half - halfBefore) / step, z / height), shade((halfAfter - half) / step, next / height));
          halfBefore = half;
          half = halfAfter;
          left += span;
          z = next;
        }
      }
      draw.flush();
    }
  });
}

function bend(local: number, side: number, width: number, x: number, radius: number, curve: number, arch: number) {
  const inner = 0.5 - side * local / width;
  const crown = Math.max(0, 1 - ((x + local) / radius) ** 2);
  return curve * inner ** 3 + arch * crown;
}

function shade(slope: number, lift: number) {
  return Math.max(-0.55, Math.min(0.39, slope * -0.58 + lift * 0.14));
}

function stripRenderer(canvas: HTMLCanvasElement, originX: number, originY: number, width: number, height: number, face: HTMLCanvasElement, capacity: number, cardWidth: number, cardHeight: number, pad: number): Strips {
  const gl = canvas.getContext('webgl2', { depth: false, antialias: false });
  if (!gl) return canvasStrips(canvas, originX, originY, width, height, face, cardWidth, cardHeight, pad);
  const program = gl.createProgram();
  function attach(type: number, source: string) {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(shader) ?? '');
    gl!.attachShader(program, shader);
    gl!.deleteShader(shader);
  }
  attach(gl.VERTEX_SHADER, `#version 300 es
    layout(location=0) in vec2 position;
    layout(location=1) in vec2 uv;
    layout(location=2) in vec4 shade;
    out vec2 texCoord;
    out vec4 tint;
    void main() {
      gl_Position = vec4(position, 0, 1);
      texCoord = uv;
      tint = shade;
    }`);
  attach(gl.FRAGMENT_SHADER, `#version 300 es
    precision mediump float;
    uniform sampler2D faceTexture;
    in vec2 texCoord;
    in vec4 tint;
    out vec4 color;
    void main() {
      vec4 base = texture(faceTexture, texCoord);
      color = base * (1.0 - tint.a) + tint * base.a;
    }`);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? '');
  gl.useProgram(program);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, face);
  const stride = 8;
  const vertices = new Float32Array(capacity * 4 * stride);
  const indices = new Uint16Array(capacity * 6);
  for (let i = 0; i < capacity; i++) {
    const first = 4 * i;
    indices.set([first, first + 1, first + 2, first + 2, first + 1, first + 3], 6 * i);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
  for (const [index, size, offset] of [[0, 2, 0], [1, 2, 2], [2, 4, 4]] as const) {
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, size, gl.FLOAT, false, stride * 4, offset * 4);
  }
  let length = 0;
  function vertex(x: number, y: number, u: number, v: number, light: number) {
    const amount = Math.abs(light) / 255;
    vertices[length++] = (x - originX) * 2 / width - 1;
    vertices[length++] = 1 - (y - originY) * 2 / height;
    vertices[length++] = u;
    vertices[length++] = v;
    vertices[length++] = amount * (light < 0 ? 19 : 255);
    vertices[length++] = amount * (light < 0 ? 11 : 223);
    vertices[length++] = amount * (light < 0 ? 10 : 173);
    vertices[length++] = Math.abs(light);
  }
  return {
    quad(x, y, dx, dy, vx, vy, u0, u1, left, right) {
      {
        const along = pad / ((u1 - u0) * cardWidth);
        const before = u0 === 0 ? along : 0;
        const after = u1 > 0.999 ? along : 0;
        const down = pad / cardHeight;
        x -= dx * before + vx * down;
        y -= dy * before + vy * down;
        u0 = before ? 0 : (pad + u0 * cardWidth) / (cardWidth + 2 * pad);
        u1 = after ? 1 : (pad + u1 * cardWidth) / (cardWidth + 2 * pad);
        dx *= 1 + before + after;
        dy *= 1 + before + after;
        vx *= 1 + 2 * down;
        vy *= 1 + 2 * down;
      }
      vertex(x, y, u0, 0, left);
      vertex(x + dx, y + dy, u1, 0, right);
      vertex(x + vx, y + vy, u0, 1, left);
      vertex(x + dx + vx, y + dy + vy, u1, 1, right);
    },
    flush() {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices, 0, length);
      gl.drawElements(gl.TRIANGLES, length / (4 * stride) * 6, gl.UNSIGNED_SHORT, 0);
      length = 0;
    },
  };
}

function canvasStrips(canvas: HTMLCanvasElement, originX: number, originY: number, width: number, height: number, face: HTMLCanvasElement, cardWidth: number, cardHeight: number, pad: number): Strips {
  const ctx = canvas.getContext('2d')!;
  const scaleX = canvas.width / width;
  const scaleY = canvas.height / height;
  const color = (light: number) => light < 0 ? `rgba(19,11,10,${String(-light)})` : `rgba(255,223,173,${String(light)})`;
  return {
    quad(x, y, dx, dy, vx, vy, u0, u1, left, right) {
      const image = face;
      ctx.setTransform(dx * scaleX, dy * scaleY, vx * scaleX, vy * scaleY,
        (x - originX) * scaleX, (y - originY) * scaleY);
      const scale = image.width / (cardWidth + 2 * pad);
      ctx.drawImage(image, (pad + u0 * cardWidth) * scale, pad * scale, (u1 - u0) * cardWidth * scale, cardHeight * scale, 0, 0, 1, 1);
      if (left || right) {
        const gradient = ctx.createLinearGradient(0, 0, 1, 0);
        gradient.addColorStop(0, color(left));
        gradient.addColorStop(1, color(right));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1, 1);
      }
    },
    flush() {},
    clear() {
      ctx.resetTransform();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

function bitmap(document: Document, width: number, height: number, dpr: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(canvas.width / width, canvas.height / height);
  draw(ctx);
  return canvas;
}

/** The study's neutral card back (the default top-view back). */
export function drawNeutralBack(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 7);
  ctx.clip();
  ctx.fillStyle = '#7c4840';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#e7b28728';
  ctx.lineWidth = 1;
  for (const direction of [-1, 1]) {
    ctx.beginPath();
    for (let offset = -height; offset <= width + height; offset += 16 * Math.SQRT2) {
      const band = offset + 8.5 * Math.SQRT2;
      const x = direction === 1 ? width + height - 4 - band : 4 - height + band;
      ctx.moveTo(x, 0);
      ctx.lineTo(x - direction * height, height);
    }
    ctx.stroke();
  }
  const dot = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, 2);
  dot.addColorStop(0.5, '#e4b58b');
  dot.addColorStop(1, '#e4b58b00');
  ctx.fillStyle = dot;
  ctx.fillRect(width / 2 - 2, height / 2 - 2, 4, 4);
  for (const [inset, color, lineWidth, radius] of [[1, '#e3c3a0', 2, 6], [4, '#7c4840', 4, 3], [6.5, '#dbab7d', 1, 0.5]] as const) {
    ctx.beginPath();
    ctx.roundRect(inset, inset, width - 2 * inset, height - 2 * inset, radius);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}
