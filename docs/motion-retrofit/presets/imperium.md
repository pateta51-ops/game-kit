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

### Icon roll-in

At `b82d5cf`, `src/ui/theme/play.css:900,988` rolls the icon from −540° and .6 scale to rest. Use `spin` with `turns: 1.5`, `scaleFrom: .6`, `ease: 'out'` and a base `dur: 1100` for normal speed. The original uses 2400 ms on slow, 500 ms on fast and 0 ms when off.
