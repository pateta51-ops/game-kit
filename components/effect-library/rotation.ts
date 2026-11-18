import type { Effect } from './effects.ts';

interface RotationSettings {
  direction?: 1 | -1;
  pivot?: string;
  ease?: string;
}

export interface SpinSettings extends RotationSettings {
  turns?: number;
  scaleFrom?: number;
  endless?: boolean;
  period?: number;
}

export interface TapSettings extends RotationSettings {
  angle?: number;
  overshoot?: number;
}

export const rotate: Effect = ({ call, el, animate }) => {
  const { angle = 90, turns = 1, direction, pivot, ease, overshoot, scaleFrom, endless, period } = call.step;
  const sign = direction === -1 ? -1 : 1;
  const held = el.style.rotate;
  const degrees = (n: number): string => `${String(n)}deg`;
  const tapped = sign * (typeof angle === 'number' ? angle : 90);
  const untap = call.verb === 'untap';
  const spin = call.verb === 'spin';
  const loop = spin && endless === true;
  const scaleIn = spin && typeof scaleFrom === 'number' && Number.isFinite(scaleFrom);
  const entry = scaleIn && !loop;
  const rest = Number.parseFloat(held) || 0;
  const delta = sign * 360 * (typeof turns === 'number' ? turns : 1);
  const from = held || degrees(untap ? tapped : 0);
  const target = spin ? rest + delta : untap ? 0 : tapped;
  const origin = el.style.transformOrigin;
  const transformOrigin = typeof pivot === 'string' ? pivot : origin || 'center';
  const restore = spin && (entry || loop || delta % 360 === 0);
  const turnSign = Math.sign(target - Number.parseFloat(from));
  const over = !spin && turnSign !== 0 && typeof overshoot === 'number' && overshoot > 0;
  const easing = ease === undefined ? (spin ? 'linear' : over ? 'cubic-bezier(.4,.1,.3,1)' : undefined) : undefined;
  const scale = el.style.scale || '1';
  const duration = typeof period === 'number' && period > 0 && Number.isFinite(period) && call.step.dur > 0
    ? Math.max(1, call.dur * period / call.step.dur)
    : Math.max(1, call.dur);
  animate(
    [
      { rotate: entry ? degrees(rest - delta) : from, transformOrigin, ...(entry ? { scale: String(scaleFrom) } : {}) },
      ...(over ? [{ rotate: degrees(target + turnSign * overshoot), transformOrigin, offset: .78 }] : []),
      { rotate: degrees(entry ? rest : target), transformOrigin, ...(entry ? { scale } : {}) },
    ],
    { rotate: restore ? held : degrees(target), transformOrigin: restore ? origin : transformOrigin },
    { ...(easing ? { easing } : {}), ...(loop ? { duration, iterations: Infinity } : {}) },
  );
  if (loop && scaleIn) animate([{ scale: String(scaleFrom) }, { scale }]);
  return undefined;
};
