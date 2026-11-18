# Imperium: Horizons motion settings

Source at `b82d5cf`

- `src/ui/board/table/FlightLayer.tsx`
- `src/ui/play/flights.ts`
- `src/ui/theme/table.css`
- `src/ui/store/settingsStore.ts`

```ts
export const imperium = {
  duration: { slow: 2400, normal: 1100, fast: 500, off: 0 },
  viaMultiplier: 1.8,
  rest: [0.4, 0.6],
  ease: 'cubic-bezier(0.45, 0, 0.25, 1)',
  stagger: 70,
  staggerMax: 8,
  staggerUnscaled: true,
} as const;
```
