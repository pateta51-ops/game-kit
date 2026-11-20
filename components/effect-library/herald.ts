// K449: `unroll` collapse mode, the `count` verb and the `banner` verb.
import type { Effect } from './effects.ts';
import { countUp } from './count.ts';
import type { BannerKey } from './bands.ts';

/** `unroll` with `reverse: true`: the actor collapses on `axis` to a line (a `colour` lights it), holds `lineMs`, flickers `gutter` times and ends at opacity 0. Times scale with the call's speed. */
export const unrollCollapse: Effect = ({ call, animate }) => {
  const axis = call.step['axis'] === 'x' ? 'X' : 'Y';
  const origin = call.step['origin'];
  const transformOrigin = typeof origin === 'string' ? origin : 'center';
  const k = Number(call.step.dur) > 0 ? call.dur / Number(call.step.dur) : 1;
  const line = Math.min(call.dur * 0.4, Number(call.step['lineMs'] ?? 0) * k);
  const n = Math.max(0, Number(call.step['gutter'] ?? 0));
  const gut = n > 0 ? call.dur * 0.3 : 0;
  const c = (call.dur - line - gut) / Math.max(1, call.dur);
  const l = (call.dur - gut) / Math.max(1, call.dur);
  const colour = call.step['colour'];
  const lit = typeof colour === 'string' ? `brightness(2.4) drop-shadow(0 0 14px ${colour}) drop-shadow(0 0 4px ${colour})` : 'none';
  const thin = `scale${axis}(.012)`;
  const frames: Keyframe[] = [{ offset: 0, transform: `scale${axis}(1)`, transformOrigin, opacity: 1, filter: 'none' }, { offset: c, transform: thin, transformOrigin, opacity: 1, filter: lit, easing: 'ease-in' }];
  if (n === 0) frames.push({ offset: 1, transform: thin, transformOrigin, opacity: 0, filter: lit });
  else {
    frames.push({ offset: l, transform: thin, transformOrigin, opacity: 1, filter: lit });
    const w = (1 - l) / n;
    for (let i = 0; i < n; i += 1) frames.push({ offset: l + w * (i + 0.5), transform: thin, transformOrigin, opacity: 0.12, filter: lit }, { offset: i === n - 1 ? 1 : l + w * (i + 1), transform: thin, transformOrigin, opacity: i === n - 1 ? 0 : 1, filter: lit });
  }
  animate(frames, { opacity: '0', transform: 'none', filter: 'none' }, { easing: 'linear' });
  return undefined;
};

/** `count`: the actor shows a number counting from `from` (default 0) to the step's `to` over the call; `prefix`, `suffix`, `colour`. A skip shows the final number. */
export const count: Effect = ({ call, el }) => {
  const value = call.value ?? 0;
  const prefix = String(call.step['prefix'] ?? '');
  const suffix = String(call.step['suffix'] ?? '');
  const show = (n: number): void => { el.textContent = `${prefix}${String(n)}${suffix}`; };
  const colour = call.step['colour'];
  Object.assign(el.style, { opacity: '1', color: typeof colour === 'string' ? colour : 'var(--fx-text,inherit)' });
  const stop = countUp({ value, from: Number(call.step['from'] ?? 0), ms: call.dur, speed: () => 1, show });
  return () => { stop(); show(value); };
};

export interface BannerSettings {
  text?: string;
  axis?: 'x' | 'y';
  origin?: string;
  /** ms to unroll (default 30% of the step) and to fade out at the end (default 30%) */
  unrollMs?: number;
  fadeMs?: number;
  /** the text's opacity and scale from keyframes (`at` ms from the step's start, as `letterboxBanner`) */
  textFrames?: readonly BannerKey[];
  /** ms before the text shows (default the unroll's end) */
  textAt?: number;
}

/** `banner`: the actor unrolls, shows `text`, holds, fades out and ends at opacity 0. */
export const banner: Effect = ({ call, el, animate }) => {
  const { text = '', axis = 'x', origin, unrollMs, fadeMs, textFrames, textAt } = call.step as BannerSettings;
  const total = Math.max(1, Number(call.step.dur));
  const u = Math.min(1, (unrollMs ?? total * 0.3) / total);
  const f = Math.min(1 - u, (fadeMs ?? total * 0.3) / total);
  const a = axis === 'x' ? 'X' : 'Y';
  const transformOrigin = origin ?? (axis === 'x' ? 'left' : 'top');
  el.style.opacity = '1';
  animate([
    { offset: 0, transform: `scale${a}(0)`, transformOrigin, opacity: 1, easing: 'ease-out' },
    { offset: u, transform: 'none', transformOrigin, opacity: 1 },
    { offset: 1 - f, transform: 'none', transformOrigin, opacity: 1 },
    { offset: 1, transform: 'none', transformOrigin, opacity: 0 },
  ], { opacity: '0', transform: 'none' }, { easing: 'linear' });
  const label = el.ownerDocument.createElement('div');
  label.textContent = text;
  label.dataset['fxPart'] = 'banner-text';
  Object.assign(label.style, { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', pointerEvents: 'none', color: 'var(--fx-text,inherit)', font: 'var(--fx-text-font,inherit)' });
  el.append(label);
  const at = (textAt ?? u * total) / total;
  const keys: Keyframe[] = textFrames
    ? textFrames.map((k) => ({ offset: Math.min(1, k.at / total), opacity: k.opacity, transform: `scale(${String(k.scale)})` }))
    : [{ offset: 0, opacity: 0 }, { offset: Math.min(at, 1 - f), opacity: 0 }, { offset: Math.min(1, at + 0.15), opacity: 1 }, { offset: 1, opacity: 1 }];
  const anim = label.animate(keys, { duration: Math.max(call.dur, 1), fill: 'both', easing: 'linear' });
  return () => {
    anim.cancel();
    label.remove();
  };
};
