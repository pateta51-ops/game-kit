export interface PileLiftSettings {
  lift?: string;
  /** K435-5: null leaves the scale alone */
  scale?: number | null;
  /** K435-5: null leaves no inline filter */
  shadow?: string | null;
  /** K435-5: one `transform` (translate then scale) instead of the separate translate and scale */
  transform?: boolean;
  /** K435-5: the lift is this share of the element's measured height, upward, in px (replaces `lift`) */
  liftShare?: number;
  liftMs?: number;
  settleMs?: number;
  liftEase?: string;
  settleEase?: string;
  speed?: number | 'instant';
}

export function pileLift(el: HTMLElement, {
  lift = '0 -2%', scale = 1.04, shadow = 'drop-shadow(0 12px 12px #0006)',
  liftMs = 250, settleMs = 300, liftEase = 'ease-out', settleEase = 'cubic-bezier(0.3, 1.3, 0.5, 1)', speed = 1, transform, liftShare,
}: PileLiftSettings = {}) {
  const up = liftShare === undefined ? lift : `0 ${String(-el.getBoundingClientRect().height * liftShare)}px`;
  const rest: Record<string, string> = transform ? { transform: 'none' } : { translate: '0 0', ...(scale === null ? {} : { scale: '1' }) };
  const raised: Record<string, string> = transform
    ? { transform: `translate(${up.trim().split(/\s+/).join(', ')})${scale === null ? '' : ` scale(${String(scale)})`}` }
    : { translate: up, ...(scale === null ? {} : { scale: String(scale) }) };
  if (shadow !== null) {
    rest['filter'] = 'drop-shadow(0 0 0 transparent)';
    raised['filter'] = shadow;
  }
  if (speed === 0 || speed === 'instant') {
    const saved = Object.fromEntries(Object.keys(raised).map((k) => [k, el.style.getPropertyValue(k)]));
    Object.assign(el.style, raised);
    let restored = false;
    const restore = (): undefined => {
      if (!restored) Object.assign(el.style, saved);
      restored = true;
      return undefined;
    };
    return { lift: undefined, settle: restore, end: restore };
  }
  const liftAnimation = el.animate([rest, raised], { duration: liftMs * speed, easing: liftEase, fill: 'forwards' });
  let settleAnimation: Animation | undefined;
  let ended = false;
  return {
    lift: liftAnimation,
    settle() {
      if (ended) return undefined;
      settleAnimation ??= el.animate([raised, rest], { duration: settleMs * speed, easing: settleEase, fill: 'forwards' });
      return settleAnimation;
    },
    end() {
      if (ended) return;
      ended = true;
      liftAnimation.cancel();
      settleAnimation?.cancel();
    },
  };
}
