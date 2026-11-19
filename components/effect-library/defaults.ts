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
