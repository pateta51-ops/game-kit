import type { CanvasEffect } from './canvas.ts';
import { clamp, ease, glow, noise, pulse, seg, sparks } from './particles.ts';
import { SHIELD_BUBBLE_DEFAULTS as SB } from './defaults.ts';

type Ctx = CanvasRenderingContext2D;
type Point = readonly [number, number];

interface ImpactLook {
  fade: Point;
  flashMs: number;
  waveCount: number;
  waveGap: number;
  waveSpeed: number;
}

export interface ShieldBubbleSettings {
  centre?: Point;
  radius?: Point;
  hex?: number;
  outline?: number;
  hitAngle?: number;
  hit?: number;
  unit?: number;
  breaks?: boolean;
  attack?: boolean;
  colour?: string;
  rimColour?: string;
  cellColour?: string;
  breakColour?: string;
  glowColour?: string;
  core?: string;
  sparkColours?: readonly [string, string];
  sparks?: { count?: number; life?: number; speed?: number; spread?: number; width?: number };
  glowRadii?: Point;
  glowAlpha?: number;
  impactPointScale?: number;
  visibleIn?: Point;
  impact?: Partial<ImpactLook>;
  flashPeak?: number;
  flashRadius?: number;
  flashStrength?: number;
  fieldAlpha?: number;
  waveWidth?: number;
  waveReach?: number;
  waveStrength?: Point;
  field?: {
    gradientStart?: number;
    band?: Point;
    rim?: Point;
    cellScale?: number;
    fresnel?: Point;
    fillThreshold?: number;
    fillAlpha?: number;
  };
  scatter?: {
    cutMs?: number;
    ms?: number;
    flashMs?: number;
    flashPeak?: number;
    flashEnd?: number;
    flashFloor?: number;
    travelAt?: number;
    fadeAt?: number;
    stride?: number;
    expansion?: number;
    drift?: Point;
    rotation?: number;
    width?: number;
    cellScale?: number;
    alpha?: Point;
  };
  recharge?: {
    assemble: Point; hum: Point; settle: Point; scanColour?: string; scanCore?: string;
    humPeak?: number; scanWidth?: number; scanAlpha?: number; snapDepth?: number;
    snapSpeed?: number; snapOvershoot?: number; strength?: Point;
  };
}


type OptionalLooks = 'recharge' | 'sparks' | 'impact' | 'field' | 'scatter';
type ShieldLook = Required<Omit<ShieldBubbleSettings, OptionalLooks>> & Pick<ShieldBubbleSettings, OptionalLooks>;

interface Bubble {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  hex: number;
}
interface Cell {
  x: number;
  y: number;
  d: number;
  r: number;
}
function cells(B: Bubble): Cell[] {
  const out: Cell[] = [];
  const w = B.hex * Math.sqrt(3);
  for (let row = -Math.ceil(B.ry / (B.hex * 1.5)); row <= Math.ceil(B.ry / (B.hex * 1.5)); row++)
    for (let col = -Math.ceil(B.rx / w) - 1; col <= Math.ceil(B.rx / w) + 1; col++) {
      const x = B.cx + col * w + (row & 1 ? w / 2 : 0),
        y = B.cy + row * B.hex * 1.5;
      const d = Math.hypot((x - B.cx) / B.rx, (y - B.cy) / B.ry);
      if (d < 1) out.push({ x, y, d, r: Math.sin(x * 12.9898 + y * 78.233) * 0.5 + 0.5 });
    }
  return out;
}
function hex(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const px = x + Math.cos(a) * s,
      py = y + Math.sin(a) * s;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function drawBubble(ctx: Ctx, B: Bubble, alpha: (c: Cell) => number, rim: number, look: ShieldLook): void {
  const { gradientStart = .55, band: [bandAt, bandAlpha] = [.85, .18], rim: [rimAt, rimAlpha] = [.98, .55],
    cellScale = .9, fresnel: [fresnelFloor, fresnelPower] = [.35, 3], fillThreshold = .6, fillAlpha = .35,
  } = look.field ?? {};
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(B.cx, B.cy);
  ctx.scale(B.rx, B.ry);
  const g = ctx.createRadialGradient(0, 0, gradientStart, 0, 0, 1);
  g.addColorStop(0, `rgba(${look.colour},0)`);
  g.addColorStop(bandAt, `rgba(${look.colour},${bandAlpha * rim})`);
  g.addColorStop(rimAt, `rgba(${look.rimColour},${Math.min(1, rimAlpha * rim)})`);
  g.addColorStop(1, `rgba(${look.rimColour},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = (look.outline * B.hex) / 15;
  for (const c of cells(B)) {
    const a = alpha(c),
      fres = fresnelFloor + (1 - fresnelFloor) * c.d ** fresnelPower;
    if (a <= 0.01) continue;
    ctx.strokeStyle = `rgba(${look.cellColour},${Math.min(1, a * fres)})`;
    hex(ctx, c.x, c.y, B.hex * cellScale);
    ctx.stroke();
    if (a > fillThreshold) {
      ctx.fillStyle = `rgba(${look.cellColour},${Math.min(1, (a - fillThreshold) * fillAlpha * fres)})`;
      ctx.fill();
    }
  }
  ctx.restore();
}
export const shieldBubble: CanvasEffect = (ctx, t, { call, x, y }) => {
  const [, , w, h] = call.from;
  const look: ShieldLook = {
    centre: [x, y], radius: [w * .58, h * .58], hex: Math.max(6, Math.min(w, h) / 22),
    ...SB,
    ...call.step as ShieldBubbleSettings,
  };
  const { centre: [cx, cy], radius: [rx, ry], hex: size, hitAngle, hit, unit: u, breaks, attack } = look;
  if (rx <= 0 || ry <= 0 || size <= 0 || u <= 0) return;
  const B: Bubble = { cx, cy, rx, ry, hex: size };
  if (look.recharge) {
    const { assemble, hum: humTime, settle: settleTime, scanColour = '220,220,220', scanCore = '255,255,255',
      humPeak = .3, scanWidth = 4, scanAlpha = .95, snapDepth = 60, snapSpeed = 3, snapOvershoot = 1.6,
      strength: [snapAlpha, humAlpha] = [.32, .35],
    } = look.recharge;
    const as = seg(t, ...assemble);
    const hum = pulse(t, ...humTime, humPeak);
    const settle = ease.inQuad(seg(t, ...settleTime));
    if (as <= 0 || settle >= 1) return;
    const scan = cy + ry * (1 - 2 * ease.out(as));
    drawBubble(ctx, B, (c) => {
      if (c.y < scan) return 0;
      const since = (c.y - scan) / (snapDepth * u);
      const snap = clamp(since * snapSpeed) * (1 + snapOvershoot * clamp(1 - since));
      return (snapAlpha * snap + humAlpha * hum) * (1 - settle) * (.75 + .25 * c.r);
    }, as * (1 - settle) * (1 + hum), look);
    if (as < 1) {
      const half = rx * Math.sqrt(Math.max(0, 1 - ((scan - cy) / ry) ** 2));
      const gradient = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
      gradient.addColorStop(0, `rgba(${scanColour},0)`);
      gradient.addColorStop(.5, `rgba(${scanCore},${scanAlpha})`);
      gradient.addColorStop(1, `rgba(${scanColour},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - half, scan - scanWidth * u / 2, half * 2, scanWidth * u);
    }
    return;
  }
  const { fade = attack ? [380, 640] : [500, 850], flashMs = attack ? 260 : 300,
    waveCount = attack ? 2 : 3, waveGap = attack ? 100 : 110, waveSpeed = attack ? .6 : .55,
  } = look.impact ?? {};
  const { cutMs = 62, ms = 520, flashMs: breakFlashMs = 160, flashPeak: breakFlashPeak = .2,
    flashEnd = .12, flashFloor = .6, travelAt = .1, fadeAt = .3, stride = 2, expansion = .35,
    drift: [driftX, driftY] = [10, 20], rotation = 2, width = 1.4, cellScale = .73, alpha: [floor, edge] = [.4, .6],
  } = look.scatter ?? {};
  const pt: [number, number] = [cx + Math.cos(hitAngle) * rx * look.impactPointScale, cy + Math.sin(hitAngle) * ry * look.impactPointScale];
  const fading = seg(t, hit + fade[0], hit + fade[1]);
  const vis =
    seg(t, hit + look.visibleIn[0], hit + look.visibleIn[1]) *
    (1 - (attack ? fading : ease.inQuad(fading)));
  const fp = pulse(t, hit, hit + flashMs, look.flashPeak);
  if (vis > 0 && (!breaks || t < hit + cutMs))
    drawBubble(
      ctx,
      B,
      (c) => {
        const d = Math.hypot(c.x - pt[0], c.y - pt[1]) / u;
        let a = look.fieldAlpha * vis + fp * clamp(1 - d / look.flashRadius) * look.flashStrength;
        for (let k = 0; k < waveCount; k++) {
          const R = (t - hit - k * waveGap) * waveSpeed;
          if (R > 0) a += clamp(1 - Math.abs(d - R) / look.waveWidth) * (1 - clamp(R / look.waveReach)) * look.waveStrength[k === 0 ? 0 : 1];
        }
        return a * (0.75 + 0.25 * c.r);
      },
      vis * (1 + fp),
      look,
    );
  glow(ctx, ...pt, look.glowRadii[0] * u, look.glowColour, look.glowAlpha * fp);
  glow(ctx, ...pt, look.glowRadii[1] * u, look.core, fp);
  const tangent = Math.atan2(pt[1] - B.cy, pt[0] - B.cx) + Math.PI / 2;
  const { count = SB.sparks.count, life = SB.sparks.life, speed = SB.sparks.speed, spread = SB.sparks.spread, width: sparkWidth = SB.sparks.width } = look.sparks ?? {};
  for (let k = 0; k < 2; k++)
    sparks(
      ctx,
      t,
      {
        seed: 4 + k,
        n: count,
        x: pt[0],
        y: pt[1],
        t0: hit,
        life,
        speed,
        angle: tangent + k * Math.PI,
        spread,
        color: `rgba(${look.sparkColours[k]},1)`,
        width: sparkWidth,
      },
      u,
    );
  if (!breaks) return;
  const sh = seg(t, hit, hit + ms);
  if (sh <= 0 || sh >= 1) return;
  const flash = pulse(t, hit, hit + breakFlashMs, breakFlashPeak);
  drawBubble(ctx, B, () => (sh < flashEnd ? flashFloor + flash : 0), (1 + flash) * (1 - sh), look);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const k = ease.out(seg(sh, travelAt, 1));
  cells(B).forEach((c, i) => {
    if (i % stride) return;
    const x = c.x + (c.x - B.cx) * expansion * k + noise(i, 2) * driftX * u * k,
      y = c.y + (c.y - B.cy) * expansion * k + driftY * u * k * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(noise(i, 5) * rotation * k);
    ctx.strokeStyle = `rgba(${look.breakColour},${(1 - seg(sh, fadeAt, 1)) * (floor + edge * c.d ** 2)})`;
    ctx.lineWidth = width * u;
    hex(ctx, 0, 0, B.hex * cellScale);
    ctx.stroke();
    ctx.restore();
  });
  ctx.restore();
};
