# Star Trek: Captain’s Chair motion settings

Source at `a69c8dac` under `src/ui/motion/effects/`.

```ts
const transferColours = {
  dilithium: { colour: '232 160 224', glowColour: '#f5b8ee' },
  latinum: { colour: '245 210 71', glowColour: '#f5d247' },
  glory: { colour: '108 196 255', glowColour: '#6cc4ff' },
};

export const stcc = {
  // resourceWarp.ts, resources.ts, gloryPlaced.ts, dismissed.ts
  gain: { mode: 'column', stagger: 110, maxCopies: 4, lightColour: 'rgb(240 250 255)' },
  spend: { mode: 'zip', stagger: 60, maxCopies: 6 },
  totalLabel: { ms: 1700, gainColour: '#8be89c', spendColour: '#ff9a80',
    font: (size: number) => `700 ${size}px/1.15 var(--label-font, 'Antonio', 'Barlow Condensed', sans-serif)` },
  transferColours,
  gainBump: { mode: 'bump', dur: 300, counterColour: '#ffd36a' },
  gloryChipFadeMs: 140,
  dismissal: { liftMs: 160, liftShare: .06, afterPayMs: 250 },
  // actionIcons.ts
  action: { mode: 'rise', dur: 560, glowColour: '#9bd6ff', liftShare: .14,
    popMs: 300, greyMs: 300, spendGapMs: 300, phoneBumpMs: 420, phoneSpendColour: '#ff9a80' },
  // warp.ts
  jump: {
    dur: 1497, outMs: 640, gapMs: 140, inMs: 640, n: 16, reach: 2.4, length: 1.5,
    colour: 'rgb(255 255 255 / .95)',
    pointLight: 'radial-gradient(circle, rgb(255 255 255) 0 12%, rgb(190 225 255 / .75) 26%, rgb(127 200 255 / 0) 62%)',
  },
  // beam.ts, awayTeams.ts
  beam: {
    dur: 1000, colour: '127 231 255', glitter: 56,
    columnLight: 'radial-gradient(ellipse 46% 50% at 50% 55%, rgb(225 250 255 / 0.9), rgb(150 235 255 / 0.45) 45%, rgb(127 231 255 / 0.12) 70%, rgb(127 231 255 / 0) 85%)',
    coreLight: 'radial-gradient(ellipse 50% 50% at 50% 55%, rgb(255 255 255 / 0.95), rgb(200 245 255 / 0.6) 40%, rgb(127 231 255 / 0) 80%)',
    speckColour: 'rgb(240 250 255)', speckGlow: 'rgb(150 225 255 / 0.85)',
  },
  chipBeam: { dur: 800, glitter: 40, speck: 3, phoneSpeck: 3.4, core: true },
  crossing: { mode: 'crossing', dur: 532, colour: '127 231 255', lightColour: 'rgb(240 250 255)' },
  // incidentBeacon.ts
  beacon: { dur: 1600, turns: 2, beamDeg: 46, fadeMs: 160, colour: '255 40 28' },
} as const;
```

A resource gain drops the icon for 240 ms, holds for 60, starts the 420 ms source column, launches the crossing light 210 ms into that column and starts the 320 ms arrival column 336 ms later. The first landing label starts 179.2 ms into arrival. A spend runs a 200 ms zip with three ghosts at 22 ms intervals, a 130 ms icon flash and 250 ms sparks. The game supplies the artwork, count caps, source and destination boxes, and the total label's placement and sign. On desktop the total rises beside the row. On phone it drifts down below the counter.

The game still owns event filtering and ordering, counter writes, action row selection and look snapshots, phone tabs and pans, chip counts, lifted and tucked card geometry, dismissal sequencing, and the incident preview flip and slide. Use the existing scale, fade, flip and move verbs to stage these around the beams.

### Combat

Source `a69c8dac`, `src/ui/motion/effects/phaser.ts`, `attack.ts`, `destroy.ts`, `missionComplete.ts` and `takeControl.ts`.

- Beam `projectile` uses the resolved shooter point and the target width midpoint at 45% of its **visible** height. Set `dur: 670`, `travelMs: 200`, `width: Math.max(3, width * .04)`, `headScale: 7`, `spotSize: width * .55`, `colour: '255 92 52'`, `core: '255 246 232'`, `headColour: '255 180 120'`, and `spotColour: '255 150 90'`. Flicker entries after arrival are `[106,.8,.85], [190,1.15,1], [274,.85,.9], [386,1.1,1]` in ms, width and opacity, with ease-in after the last. For a miss aim .72 widths to the open side, set `delay: 160`, `dur: 960`, and `miss: { past: .9, fadeMs: 420, mask: 'linear-gradient(90deg, #000 0 70%, transparent)' }`.
- Start `shimmer` on the target at beam start with `delay: 200`, `ms: 620`, `rippleMs: 496`, `dur: 820`, `pad: .14`, `hit: [.5,.45]`, `rippleSize: .3`, `colour: '150 220 255'`, `rim: '200 240 255'` and `rippleColour: 'rgb(210 245 255 / .9)'`. The separate 300 ms target jolt begins on contact and travels .035 widths along the beam.
- `dissolve` uses `heatMs: 520`, `breakMs: 900`, `cols: 8` (4 for a narrow or square token), `shown` from the exposed portion, `embers: 36`, `heat: '255 110 60'`, `emberColour: '255 170 90'`, `core: '255 246 232'` and `glow: '255 100 50'` and `heatEdge: '255 80 40'`. First heat starts at `670 * .82 - 520 * .55`, and each chained heat starts `520 * .55 + 900 * .8` later. Break starts 55% through heating. Use beat actor snapshots for cards or tokens removed by the game.
- Mission `ring-pulse` uses the chip rectangle grown by 1.04 horizontally and 1.25 vertically about its centre. Set radius to half the original chip height in px, `colour: '255 211 106'`, `count: 2`, `ms: 520`, `dur: 1040` and `width: Math.max(2, 4*k)`, with `k = clamp(height / 56, .45, 1.4)`. The shadow is `0 0 ${30*k}px ${8*k}px rgba(255,211,106,.7), inset 0 0 ${18*k}px rgba(255,211,106,.5)`. Use the default pulse frames.
- The planted flag ring uses a box centred on the pole at .8 by .24 flag heights, `dur: 520`, `width: Math.max(2, height * .04)`, `colour: '190 230 255 / .9'`, and `shadow: '0 0 12px rgb(150 220 255 / .8)'`. Pass frames `[{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }]`, starting when the flag lands.

The game resolves shooters, shots and permission prompts, orders targets and chained roots from events, pans the board, updates the occupied slots, and owns banners and labels. Source charging, target jolt, mission chip shine and sparks, flag drop, motes and card relocation are companion steps.

For the source overlay, pass `sourceLight` with `background: 'radial-gradient(circle at 50% 42%, rgb(255 236 210 / .85), rgb(255 110 60 / .4) 30%, rgb(255 92 52 / 0) 70%)'` and `shadow: \`0 0 \${sourceWidth * .08}px \${sourceWidth * .02}px rgb(255 92 52 / .7)\``. The source actor must use the shooter's card rectangle. For the target jolt, pass `jolt.vector` in stage pixels and hide the live target while the clone plays.
