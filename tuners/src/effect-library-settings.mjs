export const portalSizes = { startSize: 20, endSize: 44 };
export const neutralImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 36"><rect x="1" y="1" width="42" height="34" rx="9" fill="#a97938" stroke="#ffe3a0" stroke-width="2"/><path d="M18 10l12 8-12 8z" fill="#fff2c6"/></svg>');

const number = (unit, min, max, step, help) => ({ value: undefined, unit, min, max, step, help });
const ms = (help) => number(' ms', 0, 5000, 1, help);
const px = (help, min = 0, max = 160) => number(' px', min, max, .1, help);
const fraction = (help) => number('', 0, 1, .01, help);
const ratio = (help, min = 0, max = 4) => number('×', min, max, .01, help);
const count = (help, max = 64, min = 0) => number('', min, max, 1, help);
const deg = (help) => number('°', -360, 360, 1, help);
const rad = (help) => number(' rad', -6.29, 6.29, .01, help);
const pct = (help) => number('%', 0, 100, 1, help);
const signedMs = (help) => number(' ms', -1000, 2000, 1, help);
const choose = (choices, help) => ({ value: undefined, choices, help });
const flag = (help) => choose([[true, 'On'], [false, 'Off']], help);
const direct = choose([[1, 'Clockwise'], [-1, 'Counterclockwise']], 'Direction of rotation.');
const ease = () => choose(['linear', 'ease-in', 'ease-out', 'ease-in-out'].map((v) => [v, v]), 'How the animation speeds up or slows down.');
const pair = (fn, first, second) => [fn(first), fn(second)];
const stageX = (help) => ({ ...px(help, -160), stage: true });
const point = () => [stageX('Horizontal position from the stage’s left edge.'), px('Vertical position from the stage’s top edge.', -160)];
const rect = () => [...point(), px('Width of the box.', 1), px('Height of the box.', 1)];
const windowMs = () => pair(signedMs, 'When this phase starts.', 'When this phase ends.');
const offsets = () => pair(fraction, 'First time fraction.', 'Second time fraction.');
const fadeFrames = () => [
  { opacity: fraction('Starting opacity.') },
  { opacity: fraction('Middle opacity.'), offset: fraction('Time fraction of the middle keyframe.') },
  { opacity: fraction('Ending opacity.') },
];
const group = (title, fields, path = '', enable) => ({ title, fields, path, enable });
const optional = (title, path, fields, required = {}) => group(title, fields, path, required);
const demo = (control, value) => ({ ...control, value, demo: true });
const effect = (dur, note, groups, config = {}) => ({ dur, note, groups, ...config });

const rotation = () => ({ direction: direct, ease: ease() });
const tap = [group('Rotation', {
  ...rotation(), angle: deg('How far the card turns.'), overshoot: deg('Extra rotation before the card settles.'),
})];
const anchors = () => group('Endpoint overrides', { fromPoint: point(), toPoint: point() });
const shot = (spot) => group('Shot and timing', {
  delay: ms('Wait before launch.'), travelMs: ms('Travel time when speed is zero or omitted.'),
  speed: number(' px/ms', 0, 5, .01, 'Travel speed. Zero uses travel time.'),
  width: px('Width of the shot.', .1), ...spot,
});
const bar = [
  group('Fill', { from: fraction('Starting fraction of the bar.'), to: fraction('Ending fraction of the bar.'), ease: ease() }),
  optional('Marker hop', 'marker', {
    lift: px('Height of the marker hop.'), ease: ease(),
    scales: Array.from({ length: 4 }, (_, i) => ratio('Marker scale at keyframe ' + (i + 1) + '.')),
    offsets: offsets(),
  }, { selector: '.demo-marker', lift: 24 }),
  optional('Pips', 'pips', {
    boxes: [rect(), rect(), rect(), rect()],
    sweep: ms('Time for the sweep across the row.'), gap: px('Gap between pips.'),
    radius: px('Corner radius.'), edge: offsets(),
  }, { boxes: [[0, 0, 18, 20], [23, 0, 18, 20], [46, 0, 18, 20], [69, 0, 18, 20]], sweep: 550, gap: 5, empty: '#294a40' }),
  optional('Pip flash', 'pips.flash', {
    start: ms('When the flash begins.'), end: ms('When the flash ends.'),
    peak: fraction('Peak flash opacity.'), blur: px('Flash blur.'), width: px('Outline width.'),
  }, { start: 200, end: 800, colour: '#fff', outline: '#e9c46a', blur: 6, width: 2 }),
  optional('Pin hop', 'pin', {
    delta: pair(px, 'Horizontal travel.', 'Vertical travel.'), lift: px('Peak lift in pixels.'),
    liftFactor: ratio('Share of actor height used when pixel lift is omitted.'), window: windowMs(),
  }, { delta: [48, 0] }),
  optional('Pin glow', 'pin.glow', {
    radius: px('Glow radius.'), alpha: fraction('Glow opacity.'), tail: ms('How long the glow continues past landing.'), peak: fraction('Time fraction of peak glow.'),
  }, { radius: 24, alpha: .65, tail: 200, peak: .5 }),
  optional('Landing ring', 'pin.ring', {
    start: signedMs('Start relative to landing.'), end: signedMs('End relative to landing.'),
    from: px('Starting radius.'), to: px('Ending radius.'), width: px('Stroke width.', 1),
  }, { start: -40, end: 220, from: 7, to: 34, colour: '#e9c46a', width: 2 }),
];

const orbit = [
  group('Loop', { period: ms('Time for one orbit.') }),
  group('Orbit geometry', {
    referenceWidth: demo(px('Card width at which the dimensions are measured.', 1), 86),
    radii: pair(px, 'Horizontal orbit radius.', 'Vertical orbit radius.'),
    centerY: px('Vertical offset from the top of the card.', -70), phaseMs: signedMs('Starting time offset.'),
    spin: ratio('Star rotation relative to the orbit angle.', -4), trackWidth: px('Width of the orbit line.'),
  }, 'orbit'),
  group('Stars', {
    count: count('Number of stars.', 24), size: pair(px, 'Size of a star at the back.', 'Size of a star at the front.'),
    alpha: pair(fraction, 'Opacity at the back.', 'Opacity at the front.'),
    twinkle: [fraction('Base brightness.'), fraction('Brightness variation.'), ms('Milliseconds per radian of twinkle.'), rad('Phase difference between adjacent stars.')],
    popMs: ms('Time for stars to appear.'),
    jitter: px('Horizontal jitter of the decorative copy during a burst.'),
    copySaturation: demo(ratio('Colour saturation of the decorative copy.'), 1),
  }, 'orbit'),
];
const crackle = [
  group('Crackle burst', {
    period: ms('Time between bursts.'), at: ms('Start of the burst within a cycle.'),
    duration: ms('Length of the burst.'), margin: px('Extra area above the card for sparks.'),
  }, 'orbit.crackle'),
  group('Electric arcs', {
    seed: count('Changes the repeatable arc pattern.', 999), hz: number(' ms', 1, 300, 1, 'Time before a new arc is drawn.'),
    segments: count('Segments in each arc.', 40, 1), jag: px('Sideways displacement of arc points.'),
    alpha: fraction('Arc opacity.'), width: px('Width of the arc.', .1), fork: flag('Adds a branch to the arc.'),
  }, 'orbit.crackle.arc'),
];

export const previews = {
  'shake-group': effect(640, 'Shake two cards together.', [
    group('Shake', { amplitude: px('Horizontal movement.'), crossAmplitude: px('Vertical movement.'), frames: count('Number of alternating keyframes.', 24, 2) }),
  ], { route: true, group: true, base: () => ({ actors: ['card', 'target-card'] }) }),
  unroll: effect(640, 'Reveal the card across the selected axis.', [
    group('Reveal', { axis: choose([['x', 'Horizontal'], ['y', 'Vertical']], 'Which dimension grows from zero.'),
      origin: choose(['left', 'right', 'top', 'bottom', 'center'].map((v) => [v, v]), 'Edge or centre from which the card opens.') }),
  ]),
  spin: effect(800, 'Turn the card around its centre. Fractional turns hold their final pose.', [
    group('Rotation', { ...rotation(), turns: ratio('Number of turns. Fractions are allowed.'),
      scaleFrom: demo(ratio('Starting size for a roll-in.', .1), .6), endless: flag('Repeat up to the step end.'),
      period: ms('Time per turn cycle. The kit uses the step duration when omitted.'),
    }),
  ]),
  tap: effect(450, 'Turn a ready card and hold the tapped angle.', tap),
  untap: effect(800, 'Start from the tapped angle and return upright.', tap),
  'column-beam': effect(1000, 'A column of light reveals or removes a card.', [
    group('Column', { way: choose([['out', 'Out'], ['in', 'In']], 'Whether the actor appears or vanishes.'),
      tuck: px('Amount hidden at the base of the card.'), column: rect(),
      glitter: count('Number of specks.', 130), speck: ratio('Size multiplier for specks.'), core: flag('Adds a bright central column.'),
    }),
  ]),
  'rotating-beam': effect(1600, 'Sweep a beam around the centre of the card.', [
    group('Sweep', { turns: ratio('Number of revolutions.'), beamDeg: deg('Angular width of the beam.'), fadeMs: ms('Fade time at the ends.') }),
  ]),
  'curved-beam': effect(1200, 'A curved beam carries a token between the two anchors.', [
    group('Curved path', { control: [stageX('Curve control point across the stage.'), px('Curve control point down the stage.')],
      size: pair(px, 'Starting token size.', 'Ending token size.'), unit: ratio('Scales beam thickness and particles.', .05), tuck: flag('Tucks the token away at arrival.'),
    }, 'curve'),
  ], { verb: 'column-beam', route: true, base: ({ x }) => ({ curve: { control: [x, 66], image: neutralImage } }) }),
  'radial-streaks': effect(1700, 'Streaks travel toward or away from the centre. Flight pulse uses the two anchors.', [
    group('Streaks', { centre: point(), inward: flag('Draws the streaks toward the centre.'), seed: count('Changes the repeatable streak pattern.', 999),
      count: count('Number of streaks.', 220), alpha: fraction('Maximum streak opacity.'), unit: ratio('Scales streak travel and width.', .05),
    }),
    optional('Flight pulse', 'pulse', { lift: px('Height of the flight curve.'), flightMs: ms('Travel time of the flight pulse.') }, { lift: 40, flightMs: 550 }),
  ], { route: true }),
  projectile: effect(1100, 'A shot stretches to the target, then flickers at contact.', [
    shot({ headScale: ratio('Head size in beam widths.', 0, 14), spotSize: px('Diameter of the contact spot.'), headFadeMs: ms('Fade time of the shot head.') }),
    anchors(),
    group('Contact flicker', { flicker: Array.from({ length: 4 }, () => ({
      at: ms('Time after arrival.'), width: ratio('Beam width multiplier.'), opacity: fraction('Opacity at this frame.'), easing: ease(),
    })) }),
    optional('Miss', 'miss', { past: ratio('Extra travel as a share of the path.'), fadeMs: ms('Time to retract the missed shot.') }, { past: .3, fadeMs: 180 }),
    optional('Source light', 'sourceLight', { frames: fadeFrames() }, { background: 'radial-gradient(circle, white, transparent 70%)' }),
  ], { route: true }),
  bolt: effect(1000, 'A streak or ribbon travels between the anchors.', [
    group('Bolt form', { bolt: choose([['streak', 'Streak'], ['ribbon', 'Ribbon']], 'Streak follows the direct path. Ribbon curves and fades.'),
      unit: ratio('Scale of widths and glows.', .05), tail: fraction('Streak tail as a share of the route.'), coreWidth: px('Width of the inner stroke.', .1),
      alpha: fraction('Outer stroke opacity.'), coreAlpha: fraction('Inner stroke opacity.'),
    }),
    shot({}), anchors(),
    group('Ribbon', { lift: px('Height of the arc.'), launchMs: ms('Time before ribbon travel.'), fadeMs: ms('Time for the ribbon to fade.'),
      trailMs: ms('Time span of sampled poses.'), trailPoints: count('Number of samples in the ribbon.', 60, 2),
    }),
    group('Glow', { sourceGlowRadius: px('Radius of the glow at launch.'), headGlowRadius: px('Radius of the moving glow.'),
      sourceGlowMs: ms('Duration of the launch glow.'), sourceGlowPeak: fraction('Peak launch glow opacity.'), headGlowAlpha: fraction('Moving glow opacity.'),
    }),
  ], { route: true, verb: 'projectile', base: () => ({ bolt: 'streak' }) }),
};

Object.assign(previews, {
  'ring-pulse': effect(1300, 'Pulse a border around the card or send an expanding shockwave.', [
    group('Outline pulse', {
      box: rect(), width: px('Width of the pulse border.'), delay: ms('Wait before the first pulse.'),
      ms: ms('Time for one pulse.'), count: count('Number of pulses.', 12), period: ms('Time between pulse starts.'),
      easing: ease(), frames: fadeFrames(),
    }),
    optional('Shockwave', 'shockwaves', [{ delay: ms('Wait for the wave.'), ms: ms('Expansion time.'), radius: px('Final radius.'),
      width: px('Ring width.'), alpha: fraction('Peak opacity.'), squash: ratio('Vertical compression.', .01),
      borderWidth: px('Border width.'), outlineWidth: px('Outline width.'), outlineOffset: px('Outline inset or outset.', -40),
    }], [{ delay: 0, ms: 550, radius: 110, width: 20, alpha: .8 }]),
    group('Shockwave bounds', { unit: ratio('Scale of the wave stroke.'), clip: rect() }),
  ]),
  shimmer: effect(1200, 'An elliptical shimmer and a ripple mark a hit on the card.', [
    group('Hit and ripple', {
      pad: fraction('Padding as a share of card width.'), hit: pair(fraction, 'Contact across the card.', 'Contact down the card.'),
      rippleSize: fraction('Ripple size as a share of card width.'), rippleWidth: px('Width of the ripple stroke.'),
      delay: ms('Wait before the hit.'), ms: ms('Time for the shimmer.'), rippleMs: ms('Time for the ripple.'),
      frames: fadeFrames(), rippleFrames: fadeFrames(),
    }),
    group('Gradient stops', {
      hitStops: [fraction('Core opacity.'), fraction('Tint opacity.'), pct('Tint position.'), pct('Clear position.')],
      rimStops: [pct('Inner clear position.'), pct('Colour band position.'), fraction('Band opacity.'), pct('Rim position.'), fraction('Rim opacity.')],
    }),
    optional('Recoil', 'jolt', {
      vector: [px('Horizontal displacement.', -80), px('Vertical displacement.', -80)], ms: ms('Time to jolt back and return.'),
    }, { vector: [12, -6] }),
  ]),
  dissolve: effect(1550, 'Heat the card at the contact point and break it into embers.', [
    group('Heat and break', {
      delay: ms('Wait before heating.'), heatMs: ms('Length of the heat phase.'), breakMs: ms('Length of the break phase.'),
      shown: px('Height of the visible part of the card.', 1), cols: count('Columns in the break grid.', 28, 1),
      hit: pair(fraction, 'Contact across the card.', 'Contact down the card.'),
      cutAt: fraction('Point in the heat phase at which the card breaks.'), heatTail: fraction('Heat fade as a share of break time.'),
      heatFrames: fadeFrames(),
    }),
    group('Embers', {
      embers: count('Number of embers.', 100),
      emberSize: { min: px('Minimum ember size.'), divisor: count('Card-width divisor for ember size.', 250, 1), range: pair(ratio, 'Smallest size multiplier.', 'Largest size multiplier.') },
      emberDrift: pair(ratio, 'Radial drift multiplier.', 'Random drift multiplier.'),
      emberRise: pair(ratio, 'Minimum rise multiplier.', 'Maximum rise multiplier.'),
      emberSpan: pair(ratio, 'Minimum lifetime multiplier.', 'Maximum lifetime multiplier.'),
      emberShadow: pair(px, 'Ember shadow blur.', 'Ember shadow spread.'),
    }),
    optional('Lift and fade', 'lift', {
      distance: px('Distance the card rises.'), spin: rad('Rotation as the card rises.'), fade: windowMs(),
      ms: ms('Time for the lift.'), unit: ratio('Scale of smoke and glow.', .05), glowRadius: px('Glow radius.'),
    }, { distance: 36, spin: .15, fade: [230, 620], ms: 620 }),
    group('Lift smoke', {
      seed: count('Changes the repeatable smoke pattern.', 999), n: count('Number of puffs.'),
      x: px('Origin across the stage.', -160), y: px('Origin down the stage.', -160), t0: ms('When smoke starts.'),
      life: ms('Lifetime of a puff.'), stagger: ms('Variation in puff start time.'), radius: px('Radius around the origin.'),
      spread: px('Sideways drift.'), rise: px('Upward drift.'), size: px('Size of a puff.'), alpha: fraction('Puff opacity.'),
    }, 'lift.smoke'),
  ]),
  shatter: effect(1400, 'Break the card into rotating triangles that travel away from the impact.', [
    group('Mesh', {
      count: count('Number of visible shards.', 160), grid: pair((help) => count(help, 12, 1), 'Mesh columns.', 'Mesh rows.'),
      jitter: pair(pct, 'Horizontal jitter of mesh points.', 'Vertical jitter of mesh points.'),
      seed: count('Changes the repeatable mesh pattern.', 999), motionSeed: count('Changes the repeatable movement pattern.', 999),
      flip: flag('Mirrors the optional shard image vertically.'),
      sourceBox: rect(),
    }),
    group('Travel', {
      direction: [ratio('Horizontal component of parallel travel.', -4), ratio('Vertical component of parallel travel.', -4)],
      impact: point(), delay: ms('Wait before breaking.'), ms: ms('Travel time.'),
      unit: ratio('Scale of the travel and perspective.', .05), perspective: px('Perspective distance.', 1, 2200),
      drag: ms('Time constant for slowing down.'), travel: px('Base distance the shards travel.', 0, 760),
      speedRange: pair(ratio, 'Minimum travel multiplier.', 'Maximum travel multiplier.'),
      zRange: pair((help) => px(help, 0, 560), 'Minimum depth of travel.', 'Maximum depth of travel.'),
    }),
    group('Rotation and cooling', {
      rotateX: pair(deg, 'Minimum X rotation.', 'Maximum X rotation.'),
      rotateY: pair(deg, 'Minimum Y rotation.', 'Maximum Y rotation.'),
      rotateZ: pair(deg, 'Minimum Z rotation.', 'Maximum Z rotation.'),
      coolMs: ms('Time for shards to cool.'),
      brightness: pair(ratio, 'Brightness when cool.', 'Brightness when hot.'),
      shadowSize: pair(px, 'Shadow size when cool.', 'Shadow size when hot.'),
    }),
  ], { base: () => ({ clipSource: neutralImage }) }),
  'shield-bubble': effect(1500, 'Show a hex shield taking a hit, breaking, or recharging.', [
    group('Shield and contact', {
      centre: point(), radius: pair(px, 'Horizontal field radius.', 'Vertical field radius.'),
      hex: px('Hex cell size.', 1), outline: ratio('Outline stroke multiplier.'), unit: ratio('Scale of particles and wave travel.', .05),
      hitAngle: rad('Impact angle on the shield perimeter.'), hit: ms('Time of contact.'),
      breaks: flag('Scatters the field on contact.'), attack: flag('Uses shorter impact defaults.'),
      impactPointScale: ratio('Contact distance relative to the perimeter.'), visibleIn: windowMs(),
    }),
    group('Impact timing', {
      fade: windowMs(), flashMs: ms('Length of impact flash.'), waveCount: count('Number of waves.', 16),
      waveGap: ms('Gap between waves.'), waveSpeed: number(' units/ms', 0, 4, .01, 'Speed of the expanding waves.'),
    }, 'impact'),
    group('Impact look', {
      flashPeak: fraction('Peak flash intensity.'), flashRadius: px('Flash radius.', 1), flashStrength: ratio('Flash intensity multiplier.'),
      fieldAlpha: fraction('Base hex field opacity.'), glowRadii: pair(px, 'Outer glow radius.', 'Core glow radius.'), glowAlpha: fraction('Glow opacity.'),
      waveWidth: px('Width of the wave band.', 1), waveReach: px('Maximum wave reach.', 1, 1120),
      waveStrength: pair(ratio, 'Strength of the first wave.', 'Strength of later waves.'),
    }),
    group('Sparks', {
      count: count('Sparks per direction.'), life: ms('Spark lifetime.'), speed: ratio('Spark speed multiplier.'), spread: rad('Angular spread.'), width: px('Spark width.'),
    }, 'sparks'),
    group('Hex field', {
      gradientStart: fraction('Where the edge gradient begins.'),
      band: pair(fraction, 'Band position.', 'Band opacity.'), rim: pair(fraction, 'Rim position.', 'Rim opacity.'),
      cellScale: ratio('Hex scale.'), fresnel: [fraction('Minimum edge strength.'), ratio('Exponent of edge brightening.')],
      fillThreshold: fraction('Brightness threshold for filled cells.'), fillAlpha: fraction('Fill opacity.'),
    }, 'field'),
    group('Break scatter', {
      cutMs: ms('Time after hit before the field breaks.'), ms: ms('Duration of the scatter.'), flashMs: ms('Duration of the break flash.'),
      flashPeak: fraction('Peak break flash.'), flashEnd: fraction('End of break flash.'), flashFloor: fraction('Flash floor.'),
      travelAt: fraction('Time fraction at which scatter begins.'), fadeAt: fraction('Time fraction at which shards start fading.'),
      stride: count('Interval between cells selected for scatter.', 12, 1), expansion: ratio('Multiplier for outward movement.'),
      drift: pair(px, 'Horizontal drift.', 'Vertical drift.'), rotation: rad('Shard rotation.'), width: px('Shard stroke width.'),
      cellScale: ratio('Size multiplier of scattered cells.'), alpha: pair(fraction, 'Minimum opacity.', 'Edge opacity.'),
    }, 'scatter'),
    optional('Recharge', 'recharge', {
      assemble: windowMs(), hum: windowMs(), settle: windowMs(),
      humPeak: fraction('Peak hum opacity.'), scanWidth: px('Width of the scan line.'), scanAlpha: fraction('Opacity of the scan line.'),
      snapDepth: px('Depth of the initial light-up band.', 1), snapSpeed: ratio('Speed of the initial light-up.'),
      snapOvershoot: ratio('Extra intensity at light-up.'), strength: pair(fraction, 'Strength at light-up.', 'Strength during the hum.'),
    }, { assemble: [0, 520], hum: [420, 960], settle: [850, 1200] }),
  ]),
  'collapse-jump': effect(1500, 'Collapse a token at the source and rebuild it at the destination.', [
    group('Streaks', { n: count('Number of streaks.'), reach: ratio('Travel relative to token size.'), length: ratio('Streak length relative to token size.') }),
    group('Phases', { outMs: ms('Time to collapse.'), gapMs: ms('Pause between locations.'), inMs: ms('Time to rebuild.') }),
  ], { route: true, token: true }),
  'warp-transfer': effect(2600, 'Move neutral tokens between two anchors. Select a mode to change how they travel.', [
    group('Transfer', {
      mode: choose(['column', 'zip', 'rise', 'portal', 'crossing', 'pop', 'grey', 'bump'].map((v) => [v, v]), 'Chooses the transfer motion.'),
      count: count('Number of tokens.', 9, 1), stagger: ms('Time between token departures.'),
      from: rect(), destination: rect(), crossing: flag('Draws a light across the two locations.'),
      crossingDots: count('Number of crossing dots.'), lift: px('Height of the lift.'),
    }),
    ...['columnUp', 'columnDown'].map((path, i) => group(i === 0 ? 'Departure column' : 'Arrival column', {
      width: ratio('Width relative to the token width.'), height: ratio('Height relative to the token height.', 0, 9),
      bottom: ratio('Offset of the column base in token heights.', -2), sparks: count('Number of sparks.'),
      frames: Array.from({ length: 3 }, () => ({ offset: fraction('Frame time.'), colOp: fraction('Column opacity.'), tokOp: fraction('Token opacity.') })),
    }, path)),
    group('Zip, rise and pop', {
      zipGhosts: count('Number of zip afterimages.'), zipSparks: count('Number of zip sparks.'), zipPopMs: ms('Arrival pop time.'),
      riseMs: ms('Time to rise.'), riseTravelMs: ms('Travel time after rising.'), popOffsets: offsets(),
    }),
    group('Grey mode', {
      beforeLook: { opacity: fraction('Starting opacity.') }, afterLook: { opacity: fraction('Ending opacity.') },
    }),
    group('Portal', {
      outward: flag('Moves outward from the portal.'), startSize: demo(px('Starting token size.', 1), portalSizes.startSize), endSize: demo(px('Ending token size.', 1), portalSizes.endSize),
      alpha: fraction('Token opacity.'), collapse: windowMs(), elapsed: ms('Time already elapsed.'),
      travelMs: ms('Travel time.'), travelAt: ms('When travel starts.'), growth: windowMs(),
      spin: [ratio('Initial spin rate.', -4), number(' °/ms²', -.002, .002, .00001, 'Spin acceleration.')],
    }, 'portal'),
    optional('Portal vortex', 'portal.vortex', {
      size: px('Diameter of the vortex.', 1), open: windowMs(), strokeWidth: px('Vortex stroke width.', .1), alpha: fraction('Vortex opacity.'),
      armCount: count('Number of spiral arms.', 20, 1), armSegments: count('Samples in each arm.', 90, 2),
      armTurns: ratio('Number of turns of each arm.'), armRadius: px('Arm radius in SVG units.'),
      armExponent: ratio('Exponent of arm growth.'), armSpin: ratio('Arm rotation rate.', -4),
      ringMs: ms('Time for the rings.'), ringTurns: ratio('Turns made by the rings.', -4),
      ringSpacing: deg('Angle between rings.'), ringScale: pair(ratio, 'Starting ring scale.', 'Ending ring scale.'), ringAlpha: fraction('Ring opacity.'),
    }, { size: 110, open: [0, 400] }),
    optional('Total label', 'totalLabel', {
      at: point(), travel: px('Vertical label travel.'), ms: ms('Duration of the label.'), delay: ms('Wait before showing the label.'),
    }, { text: '+3', at: [235, 170] }),
  ], { route: true, token: true }),
  spiral: effect(1800, 'A token spirals into or out of a portal, leaving a luminous tail.', [
    group('Path', {
      outward: flag('Switches between arrival and departure.'), centre: point(), parked: rect(),
      lift: px('Lift height.'), squash: ratio('Vertical compression of the orbit.'),
      orbit: ratio('Share of travel used as orbit radius.', .01), unit: ratio('Scale of particles and strokes.', .05),
    }, 'spiral'),
    group('Token and trail', {
      heading: deg('Heading when parked.'), nose: deg('Facing angle of the artwork.'), flip: flag('Mirrors the token.'),
      tail: [0, 1, 2].map((i) => count(['Red', 'Green', 'Blue'][i] + ' channel of the tail.', 255)),
      tip: [0, 1, 2].map((i) => count(['Red', 'Green', 'Blue'][i] + ' channel of the tip.', 255)),
      ribbonReach: ratio('Length multiplier of the ribbon.'),
    }, 'spiral'),
  ], { route: true, token: true, verb: 'warp-transfer', base: () => ({ spiral: { image: neutralImage } }) }),
});

Object.assign(previews, {
  stamp: effect(1000, 'Press a neutral stamp onto the card.', [
    group('Stamp', {
      tilt: deg('Angle of the stamp.'), ms: ms('Time for the stamp to settle.'), ease: ease(),
      scales: Array.from({ length: 3 }, (_, i) => ratio('Stamp scale at keyframe ' + (i + 1) + '.')),
      pressOffset: fraction('Time fraction of the press keyframe.'), frames: fadeFrames(),
    }),
    optional('Card press', 'press', { ms: ms('Length of the card press.'), delay: ms('Wait before the card press.'), ease: ease(), frames: fadeFrames() },
      { ms: 200, delay: 90, frames: [{ scale: '1' }, { scale: '.94' }, { scale: '1' }] }),
    optional('Stamp ring', 'ring', { ms: ms('Length of the ring.'), delay: ms('Wait before the ring.'), ease: ease(), frames: fadeFrames() },
      { ms: 420, delay: 90, style: { inset: '0', border: '2px solid currentColor', borderRadius: '6px' }, frames: [{ opacity: 1, scale: '.85' }, { opacity: 0, scale: '1.4' }] }),
  ], { base: () => ({ text: 'APPROVED', style: { height: '23%', background: '#242230', color: '#ded5ff', fontSize: '12px' } }) }),
  motes: effect(1000, 'Small particles rise from the card. An optional dissolve fades the face behind them.', [
    group('Particle size and light', {
      count: count('Number of particles.', 120), size: px('Base particle size.'), minSize: px('Minimum particle size.'),
      sizeJitter: pair(ratio, 'Base size multiplier.', 'Random size variation.'),
      glow: ratio('Shadow blur relative to particle size.'), z: demo(count('Layer order for the particles.', 12), 2),
    }),
    group('Travel and timing', {
      box: rect(), rise: px('Distance particles rise.'), spread: px('Horizontal spread.'),
      lag: ratio('Stagger relative to particle duration.'), ms: ms('Lifetime before applying stagger.'),
      lifeJitter: pair(ratio, 'Base life multiplier.', 'Random life variation.'),
      riseFactor: pair(ratio, 'Base rise multiplier.', 'Random rise variation.'),
      peakOffset: fraction('Time fraction at peak opacity.'), endScale: ratio('Ending particle size.'), ease: ease(),
      dissolve: fadeFrames(), dissolveEase: ease(),
    }),
  ]),
  flicker: effect(1000, 'Blink a translucent overlay or apply seeded brightness changes and jitter.', [
    group('Overlay', { times: count('Number of blinks per cycle.', 20, 1), ease: ease(),
      loop: flag('Repeats the cycle until the step ends.'), period: ms('Time for a cycle.'), frames: fadeFrames(),
    }),
    optional('Grey overlay', 'grey', { grayscale: fraction('How much colour is removed at peak.'), brightness: ratio('Actor brightness at peak.') }),
    optional('Buzz', 'buzz', {
      window: windowMs(), sampleMs: number(' ms', 1, 80, 1, 'Time between jitter samples.'),
      timeOffset: signedMs('Offset of the noise clock.'), period: ms('Time for a noise cycle. Zero disables repeating.'),
      peak: fraction('Peak buzz envelope.'), brightness: pair(ratio, 'Dim brightness.', 'Bright brightness.'),
      noiseMs: number(' ms', 1, 300, 1, 'Noise time scale.'), threshold: ratio('Threshold between dim and bright samples.', -1),
      saturation: ratio('Colour saturation.'), hue: deg('Hue change at peak.'), power: ratio('Exponent of the sine envelope.', .01),
      jitter: pair(px, 'Horizontal jitter.', 'Vertical jitter.'),
      jitterMs: [number(' ms', 1, 100, 1, 'Horizontal jitter time scale.'), number(' ms', 1, 100, 1, 'Vertical jitter time scale.')],
    }, { window: [100, 800], brightness: [.7, 1.6], noiseMs: 40 }),
  ]),
  'bar-fill': effect(1000, 'Fill a meter, sweep pips, or move a numbered pin.', bar,
    { base: () => ({ colour: '#c7b6ff' }), bar: true }),
  refresh: effect(1300, 'Lift the status banner and sweep the filtered face away to reveal a ready card.', [
    group('Lift and sweep timing', {
      liftMs: ms('Time to lift the banner.'), drainMs: ms('Time to sweep the face.'), drainAt: fraction('Share of the lift before the sweep starts.'),
      liftEase: ease(), drainEase: ease(), liftMiddle: fraction('Time of the middle lift keyframe.'),
    }),
    group('Banner and sweep line', {
      liftRise: pair(fraction, 'Middle rise as a share of card height.', 'Final rise as a share of card height.'),
      liftScale: pair(ratio, 'Banner scale at the middle.', 'Banner scale at the end.'),
      lineHeight: fraction('Line height as a share of card height.'), lineMinHeight: px('Minimum line height.'),
      lineFade: offsets(),
    }),
  ], { base: () => ({ banner: '.demo-banner' }) }),
  pulse: effect(0, 'Repeat a pulse on the live card until stopped.', [
    group('Pulse loop', { period: ms('Time between pulses.'), easing: ease(), frames: fadeFrames() }),
  ], { loop: 'startPulse' }),
  'idle: bob': effect(0, 'Raise and lower the live card until stopped.', [
    group('Bob loop', { period: ms('Time for one rise and return.'), rise: px('Peak height above the resting card.'), easing: ease(), frames: fadeFrames() }),
  ], { loop: 'startIdle', base: () => ({ kind: 'bob' }) }),
  'idle: breathe': effect(0, 'Fade the live card in and out until stopped.', [
    group('Breathe loop', { period: ms('Time for one breath.'), easing: ease(), frames: fadeFrames() }),
  ], { loop: 'startIdle', base: () => ({ kind: 'breathe' }) }),
  'idle: orbit': effect(0, 'Stars circle above the live card until stopped.', orbit,
    { loop: 'startIdle', base: () => ({ kind: 'orbit' }) }),
  'idle: crackle': effect(0, 'Stars circle the card and electric arcs fire at intervals until stopped.', [...orbit, ...crackle],
    { loop: 'startIdle', base: () => ({ kind: 'orbit', orbit: { crackle: { period: 1500, at: 150, duration: 480 } } }) }),
});
