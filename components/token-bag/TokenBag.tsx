// The bag with its count, in 3D or 2D. The 3D side is loaded by dynamic import, so this is the entry that needs three.js;
// `ui2d.ts` has the same view with no three.js (always 2D).
import { lazy, useEffect, type ComponentType } from 'react';
import type { FallbackReason } from './mode.ts';
import type { RestProps, DrawProps } from './props3d.ts';
import { TokenBagView, type TokenBagProps } from './TokenBagView.tsx';
export type { BagDraw, TokenBagProps } from './TokenBagView.tsx';

/** The 3D chunk failed to load (offline before it was cached): fall back to 2D. */
function Failed({ onFail }: { onFail: (r: FallbackReason) => void }) {
  useEffect(() => onFail('error'), [onFail]);
  return null;
}

const Rest = lazy((): Promise<{ default: ComponentType<RestProps> }> =>
  import('./Rest.tsx').then((m) => ({ default: m.Rest }), () => ({ default: Failed })),
);
const Draw = lazy((): Promise<{ default: ComponentType<DrawProps> }> =>
  import('./Draw.tsx').then((m) => ({ default: m.Draw }), () => ({ default: Failed })),
);

export function TokenBag(p: TokenBagProps) {
  return <TokenBagView {...p} Rest={Rest} Draw={Draw} />;
}
