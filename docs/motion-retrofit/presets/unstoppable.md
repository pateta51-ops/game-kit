# Unstoppable motion settings

Source at `52c19f6`

- `src/ui/board/Hand.tsx`
- `src/ui/board/TokenFlights.tsx`
- `src/ui/board/threatBuffs.tsx`
- `src/ui/board/playMotion.ts`
- `src/ui/play/motion.ts`

```ts
const ease = 'cubic-bezier(0.45, 0, 0.25, 1)';

export const unstoppable = {
  speed: { off: 0, fast: 0.6, normal: 1, slow: 2 },
  card: {
    flightMs: 420, ease: 'cubic-bezier(0.3, 0.7, 0.2, 1)', arcHeight: 48, apex: 0.55,
    glide: { anchor: 'destination', liftRatio: 0.12, progress: 0.55, swell: 0.06, relativeSwell: true, round: 1000, opaque: true },
  },
  token: {
    flightMs: 700, ease, stagger: 110, arcHeight: 60,
    glide: { liftRatio: 0.15, swell: 0.15, opaque: true },
  },
  marker: {
    flightMs: 650, ease, arcHeight: 14,
    glide: { anchor: 'destination', swell: 0.15, plainEnds: true },
  },
} as const;
```

### Hit flash

Source `52c19f6`, `src/ui/board/TargetArrow.tsx`, `src/ui/theme/motion.css`, `src/ui/play/arrow.ts`. Use `ring-pulse` at the target centre with a square side of `Math.max(48, Math.min(width,height)*.9)` px. Set `width: 0`, `dur: 420`, `count: 1`, `easing: 'ease-out'`, and:

```ts
const flash = {
  background: 'radial-gradient(circle, rgb(255 250 220 / .95) 0, rgb(255 180 70 / .75) 30%, rgb(255 70 40 / .35) 52%, rgb(255 60 30 / 0) 70%)',
  frames: [
    { transform: 'scale(.25)', opacity: 1 },
    { transform: 'scale(1)', opacity: .85, offset: .35 },
    { transform: 'scale(1.35)', opacity: 0 },
  ],
};
```

The game resolves the arrow, target, damage and timing of the damage tokens. The target shake is a companion step lasting 75% of the flash.
