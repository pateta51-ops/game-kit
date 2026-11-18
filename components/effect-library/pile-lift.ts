export interface PileLiftSettings {
  lift?: string;
  scale?: number;
  shadow?: string;
  liftMs?: number;
  settleMs?: number;
  liftEase?: string;
  settleEase?: string;
  speed?: number | 'instant';
}

export function pileLift(el: HTMLElement, {
  lift = '0 -2%', scale = 1.04, shadow = 'drop-shadow(0 12px 12px #0006)',
  liftMs = 250, settleMs = 300, liftEase = 'ease-out', settleEase = 'cubic-bezier(0.3, 1.3, 0.5, 1)', speed = 1,
}: PileLiftSettings = {}) {
  const rest = { translate: '0 0', scale: '1', filter: 'drop-shadow(0 0 0 transparent)' };
  const raised = { translate: lift, scale: String(scale), filter: shadow };
  if (speed === 0 || speed === 'instant') {
    const { translate, scale: originalScale, filter } = el.style;
    Object.assign(el.style, raised);
    let restored = false;
    const restore = (): undefined => {
      if (!restored) Object.assign(el.style, { translate, scale: originalScale, filter });
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
