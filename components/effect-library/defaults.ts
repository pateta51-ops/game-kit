// The defaults of the effects, exported so tuners and games read them instead of retyping; the effects destructure from these.
export const GLITCH_DEFAULTS = {
  slices: 3, idleMs: [3500, 7000] as [number, number], burstMs: 200, tearMs: 600, repeat: 0.25, repeatGapMs: [100, 140] as [number, number],
};
export const COLUMN_BEAM_DEFAULTS = { colour: '255 255 255', way: 'out' as 'in' | 'out', tuck: 0, glitter: 56, speck: 1, core: false, speckColour: 'white', actorZ: 2 };
export const ROTATING_BEAM_DEFAULTS = { colour: '255 255 255', turns: 2, beamDeg: 46, fadeMs: 160 };
export const RETICLE_DEFAULTS = { unit: 1, colour: '255,255,255', padding: [18, 6] as readonly [number, number], length: 16, width: 2, closeMs: 220, fade: [520, 660] as readonly [number, number] };
export const PLASMA_ORB_DEFAULTS = { speed: 1, pulsePeriod: 2400, pulseAmount: 0.05, swell: 0.1 };
export const DRIFT_CLOUD_DEFAULTS = { cohortDim: 0.1, cutoff: 0.004, edgeFade: 0.7, emberColour: '#ddd', emberOpacity: 0.6, emberSize: 0.5, minEmberSize: 1 };
export const COLLAPSE_DEFAULTS = { colour: 'rgb(255 255 255 / .95)', n: 16, reach: 2.4, length: 1.5, outMs: 640, gapMs: 140, inMs: 640 };
export const SHEEN_DEFAULTS = { angle: 100, bandWidth: 50, colour: 'rgba(255,255,255,.25)', stops: [0, 100] as readonly [number, number], travel: [-110, 220] as readonly [number, number], sweep: [0, 1] as readonly [number, number], easing: 'linear' };
// K436: the defaults the energy tuner retyped
export const WARP_TRANSFER_DEFAULTS = { mode: 'column' as 'column' | 'zip' | 'rise' | 'portal' | 'crossing' | 'pop' | 'grey' | 'bump', count: 1, stagger: 110, zipStagger: 60, lift: 60, crossing: true, crossingDots: 5, colour: '255 255 255', zipGhosts: 3, zipSparks: 8, zipPopMs: 130, riseMs: 260, riseTravelMs: 300 };
export const SPIRAL_DEFAULTS = { outward: false, lift: 34, squash: 0.62, orbit: 0.2, unit: 1, heading: 0, nose: 0, flip: false, ribbonReach: 1, engine: '255,255,255' };
export const PROJECTILE_DEFAULTS = { colour: '255 255 255', core: '255 255 255', travelMs: 200, delay: 0, headScale: 7, headFadeMs: 80 };
export const SHIELD_BUBBLE_DEFAULTS = {
  hitAngle: Math.PI, hit: 0, unit: 1, breaks: false, attack: false, outline: 1.4,
  colour: '220,220,220', rimColour: '255,255,255', cellColour: '240,240,240',
  breakColour: '240,240,240', glowColour: '220,220,220', core: '255,255,255',
  sparkColours: ['240,240,240', '255,255,255'] as [string, string], glowRadii: [110, 34] as [number, number], glowAlpha: 0.7, impactPointScale: 0.97,
  visibleIn: [-20, 40] as [number, number], flashPeak: 0.1, flashRadius: 110, flashStrength: 1.4, fieldAlpha: 0.14,
  waveWidth: 30, waveReach: 560, waveStrength: [2.2, 1.2] as [number, number],
  sparks: { count: 16, life: 380, speed: 0.7, spread: 0.7, width: 2 },
};
export const CURVED_BEAM_DEFAULTS = { colour: '255,255,255', moteColour: '255,255,255', sparkColour: 'white', unit: 1, size: [40, 34] as [number, number], tuck: true };
