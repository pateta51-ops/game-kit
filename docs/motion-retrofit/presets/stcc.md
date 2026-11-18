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

## Signals

All files below are under `src/ui/motion/effects/` at `a69c8dac`. Measurements come from the game's current card, mark, flag or track.

```ts
// stardateResolved.ts. Stamp after the 520 ms lift, hold 900 ms, then move the
// same actor so the stamp rides with it. Use the card height before the lift.
const resolved = (h: number) => ({
  dur: 280, text: 'RESOLVED', tilt: -6,
  style: { top: '62%', height: '13%', zIndex: '5', border: `${Math.max(2, h * .012)}px solid #ffd36a`,
    borderRadius: '8px', background: 'rgb(5 8 14 / .9)', color: '#ffd36a', fontFamily: 'var(--label-font)',
    fontWeight: '700', fontSize: `${h * .075}px`, letterSpacing: '.2em', boxShadow: '0 0 18px rgb(255 211 106 / .6)' },
});

// traitMarked.ts. Place this actor at the measured mark box, centred on the mark.
// Supply the source tick SVG as image. The chip give/tint and the ink drops are
// separate layers starting at 216 ms. Reveal the board mark at completion.
const trait = (d: number, colour: string, image: string) => ({
  dur: 676, ms: 300, ease: 'cubic-bezier(.5,0,.75,1)', image,
  style: { inset: '0', width: '100%', height: '100%', padding: '13%', borderRadius: '50%',
    background: colour, border: `${Math.max(1, d * .075)}px solid rgb(255 255 255 / .92)`,
    boxShadow: `0 0 ${d * .22}px color-mix(in srgb, ${colour} 70%, transparent)` },
  frames: [
    { transform: 'scale(2.6) rotate(-20deg)', opacity: 0, filter: `drop-shadow(0 ${d * .5}px ${d * .3}px #000a)` },
    { transform: 'scale(1.5) rotate(-14deg)', opacity: .9, offset: .4 },
    { transform: 'scale(.9) rotate(-8deg)', opacity: 1, offset: .72, filter: 'drop-shadow(0 0 0 #0000)' },
    { transform: 'scale(1) rotate(-8deg)', opacity: 1, filter: 'drop-shadow(0 0 0 #0000)' },
  ],
  ring: { delay: 216, ms: 460,
    style: { border: `${Math.max(1, d * .05)}px solid color-mix(in srgb, ${colour} 80%, transparent)` },
    frames: [{ transform: 'scale(.9)', opacity: .9, easing: 'cubic-bezier(.2,.7,.4,1)' }, { transform: 'scale(1.9)', opacity: 0 }] },
});

// promotion.ts. Pass the badge art or omit it for the VP disc. Start moving at 710 ms (250 ms after the press), while the ring finishes.
// Wait 400 ms in its slot before dissolving the badge.
const promotion = (w: number, h: number, image?: string) => {
  const s = w * .38;
  return {
    dur: 748, ms: 460, ease: 'linear', text: image ? '' : 'VP', image,
    style: { left: `${(w - s) / 2}px`, top: `${h * .44 - s / 2}px`, width: `${s}px`, height: `${s}px`, zIndex: '5',
      background: image ? 'transparent' : '#2a6f9b', borderRadius: image ? '0' : '50%', border: '0',
      color: '#fff', fontSize: `${s * .4}px`, filter: `drop-shadow(0 ${s * .06}px ${s * .08}px rgb(0 0 0 / .75))` },
    frames: [
      { offset: 0, transform: `translateY(${-h * .3}px) scale(1.9) rotate(-14deg)`, opacity: 0, easing: 'cubic-bezier(.3,0,.7,1)' },
      { offset: .7, transform: 'translateY(0) scale(1.12) rotate(0deg)', opacity: 1, easing: 'ease-out' },
      { offset: .85, transform: 'scale(.84)', opacity: 1, easing: 'ease-out' },
      { offset: 1, transform: 'scale(1)', opacity: 1 },
    ],
    press: { delay: 322, ms: 184, frames: [
      { transform: 'scale(1)' }, { offset: .45, transform: 'scale(.97)' }, { transform: 'scale(1)' },
    ] },
    ring: { delay: 368, ms: 380, style: { border: `${Math.max(1.5, s * .04)}px solid rgb(230 247 253 / .95)` },
      frames: [{ transform: 'scale(.7)', opacity: .95, easing: 'cubic-bezier(.2,.7,.4,1)' }, { transform: 'scale(1.9)', opacity: 0 }] },
  };
};

// promotion.ts. Use the badge as the actor after its 400 ms hold in the slot.
const promotionDissolve = (x: number, y: number, s: number) => ({
  dur: 780, ms: 520, count: 18, z: 5, box: [x + s * .05, y + s * .15, s * .9, s * .7] as const,
  colour: ['rgb(230 247 253)', 'rgb(149 210 235)'],
  size: s * .05, minSize: 2, sizeJitter: [.6, 1], lifeJitter: [.8, .4],
  rise: s, spread: s * .6, lag: .3, glow: 2, glowColour: 'rgb(149 210 235 / .9)',
  startTransform: 'none', endScale: 1,
  dissolve: [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.2)', opacity: 0 }],
});

// takeControl.ts, fxKit.ts. Use the flag as the actor.
const flagDissolve = (x: number, y: number, w: number, h: number, pole: number, mine: boolean, phone: boolean) => ({
  dur: 1215, ms: 900, count: phone ? 26 : 40, z: 9, box: [x, y, w * .9, h * .45] as const,
  colour: mine ? 'rgba(160,215,255,.95)' : 'rgba(255,170,150,.95)',
  size: Math.max(3, pole / 14), rise: h * .45 * 1.4, lag: .35,
  dissolve: [{ opacity: 1, filter: 'brightness(1)' }, { opacity: .9, filter: 'brightness(1.8)', offset: .3 },
    { opacity: 0, filter: 'brightness(2.5) blur(2px)' }],
});

// continueResolution.ts. Play after the 1300 ms row light. Drop the gold layer
// at 560 ms into the flicker, and wait 220 ms after it for the next match.
const k = 560 / 920;
const continueResolution = (pad: number) => ({
  dur: 920, times: 3, colour: 'rgba(150,160,180,.5)',
  grey: { brightness: .75 },
  style: { borderRadius: `${pad}px`, boxShadow: `0 0 0 ${Math.max(1, pad * .4)}px rgba(190,200,220,.9)` },
  frames: [0, 1, .15, 1, .2, 1, .85, 0].map((opacity, i) => ({
    opacity, offset: [0, .12*k, .28*k, .45*k, .62*k, .8*k, k, 1][i],
  })),
});

// crewTrack.ts. Register --v as a numeric CSS property and point selector at
// the marker on the actor clone. The number bump, glow and badge follow the hop.
const crewTrack = (from: number, to: number, dotHeight: number) => ({
  from, to, dur: 360 + 120 * (Math.max(1, to - from) - 1), property: '--v' as const,
  marker: { selector: '.track__bar i', lift: dotHeight * .45 },
});
```

### Combat

Source `a69c8dac`, `src/ui/motion/effects/phaser.ts`, `attack.ts`, `destroy.ts`, `missionComplete.ts` and `takeControl.ts`.

- Beam `projectile` uses the resolved shooter point and the target width midpoint at 45% of its **visible** height. Set `dur: 670`, `travelMs: 200`, `width: Math.max(3, width * .04)`, `headScale: 7`, `spotSize: width * .55`, `colour: '255 92 52'`, `core: '255 246 232'`, `headColour: '255 180 120'`, and `spotColour: '255 150 90'`. Flicker entries after arrival are `[106,.8,.85], [190,1.15,1], [274,.85,.9], [386,1.1,1]` in ms, width and opacity, with ease-in after the last. For a miss aim .72 widths to the open side, set `delay: 160`, `dur: 960`, and `miss: { past: .9, fadeMs: 420, mask: 'linear-gradient(90deg, #000 0 70%, transparent)' }`.
- Start `shimmer` on the target at beam start with `delay: 200`, `ms: 620`, `rippleMs: 496`, `dur: 820`, `pad: .14`, `hit: [.5,.45]`, `rippleSize: .3`, `colour: '150 220 255'`, `rim: '200 240 255'` and `rippleColour: 'rgb(210 245 255 / .9)'`. The separate 300 ms target jolt begins on contact and travels .035 widths along the beam.
- `dissolve` uses `heatMs: 520`, `breakMs: 900`, `cols: 8` (4 for a narrow or square token), `shown` from the exposed portion, `embers: 36`, `heat: '255 110 60'`, `emberColour: '255 170 90'`, `core: '255 246 232'` and `glow: '255 100 50'` and `heatEdge: '255 80 40'`. First heat starts at `670 * .82 - 520 * .55`, and each chained heat starts `520 * .55 + 900 * .8` later. Break starts 55% through heating. Use beat actor snapshots for cards or tokens removed by the game.
- Mission `ring-pulse` uses the chip rectangle grown by 1.04 horizontally and 1.25 vertically about its centre. Set radius to half the original chip height in px, `colour: '255 211 106'`, `count: 2`, `ms: 520`, `dur: 1040` and `width: Math.max(2, 4*k)`, with `k = clamp(height / 56, .45, 1.4)`. The shadow is `0 0 ${30*k}px ${8*k}px rgba(255,211,106,.7), inset 0 0 ${18*k}px rgba(255,211,106,.5)`. Use the default pulse frames.
- The planted flag ring uses a box centred on the pole at .8 by .24 flag heights, `dur: 520`, `width: Math.max(2, height * .04)`, `colour: '190 230 255 / .9'`, and `shadow: '0 0 12px rgb(150 220 255 / .8)'`. Pass frames `[{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }]`, starting when the flag lands.

The game resolves shooters, shots and permission prompts, orders targets and chained roots from events, pans the board, updates the occupied slots, and owns banners and labels. Source charging, target jolt, mission chip shine and sparks, flag drop, motes and card relocation are companion steps.

For the source overlay, pass `sourceLight` with `background: 'radial-gradient(circle at 50% 42%, rgb(255 236 210 / .85), rgb(255 110 60 / .4) 30%, rgb(255 92 52 / 0) 70%)'` and `shadow: \`0 0 \${sourceWidth * .08}px \${sourceWidth * .02}px rgb(255 92 52 / .7)\``. The source actor must use the shooter's card rectangle. For the target jolt, pass `jolt.vector` in stage pixels and hide the live target while the clone plays.
## Refresh and tutorial pulse (K352)

Source at `a69c8dac` in `src/ui/motion/effects/refresh.ts:20–25,95–149,174–219` and `src/ui/theme/table.css`.

- Resolve the ready card and supply the old banner in its clone. Set `banner: '[data-exhausted-tag]'`, `face: '.card__face, .standin'` and `filter: 'saturate(0.15) brightness(0.6)'`. The face selector supplies the artwork copied for the drain. Keep the game's banner markup and set the card radius on the actor. Start successive steps 120 ms apart (hold the outgoing appearance until each starts).
- `liftMs: 560`, `drainMs: 480`, `drainAt: 0.25` (140 ms delay), `liftEase: 'cubic-bezier(.3,.1,.5,1)'`, `drainEase: 'cubic-bezier(.45,.1,.4,1)'`. Step duration is 620 ms with the banner or 480 ms without it.
- `liftMiddle: 0.35`, `liftRise: [0.08, 0.2]`, `liftScale: [1.06, 1.12]`, `textShadow: ['0 2px 6px #000', '0 18px 22px #000']`.
- `lineBackground: 'linear-gradient(90deg, transparent, rgba(220,240,255,.95) 20%, #fff 50%, rgba(220,240,255,.95) 80%, transparent)'`, `lineShadow: '0 0 <3% of card height in px> rgba(170,215,255,.9)'`, `lineRadius: '2px'`, `lineHeight: 0.012`, `lineMinHeight: 2`, `lineFade: [0.12, 0.85]`.

From `src/ui/theme/tutorial.css:146–171` at the same commit. Keep the solid `#4de3d0` outline in CSS (width `calc(var(--u, 10px) * 0.28)`, offset `calc(var(--u) * 0.25)`). Pulse with `period: 1600`, `easing: 'ease-in-out'`, and outline-color keyframes `#4de3d0 → rgba(77,227,208,0.25) → #4de3d0` at 0%, 50%, and 100%.
