// K396: the side-view riffle (camera tilts edge-on, thumb-bent halves riffle, bridge, back to the pile). Ported from the
// approved riffle study (game-kit branch riffle-preview 610c8d6, tuners/src/riffle-side.mjs).
import { animatePile, cloneBack, ease, makeSurface, mix, phase, type PileMotion } from './riffle-surface.ts';

export interface RiffleSideOpts {
  speed?: number;
  cards?: number;
  orientation?: 'portrait' | 'landscape' | undefined;
  /** Seconds at speed 1: tilt in / split, riffle, bridge, tilt out / square. */
  durations?: readonly number[];
  back?: (top: HTMLElement) => HTMLElement;
}

export function riffleSide(deck: HTMLElement, {
  speed = 1,
  cards = 20,
  orientation,
  durations = [0.45, 1.35, 0.75, 0.45],
  back = cloneBack,
}: RiffleSideOpts = {}): PileMotion {
  const [enter = 0, riffleTime = 0, bridgeTime = 0, exit = 0] = durations;
  return animatePile(deck, { speed, durations }, (layer, { width, height }, top) => {
    const landscape = orientation ? orientation.toLowerCase() === 'landscape' : width > height;
    const length = Math.max(width, height);
    const depth = Math.min(width, height);
    const unit = length / 132;
    const pitch = 1.2;
    const segments = 7;
    const sliceWidth = 132 / segments;
    const count = Math.max(2, Math.round(cards));
    const plane = layer.ownerDocument.createElement('div');
    const packet = layer.ownerDocument.createElement('div');
    const shadow = layer.ownerDocument.createElement('div');
    layer.style.perspective = `${String(850 * unit)}px`;
    plane.style.transformStyle = packet.style.transformStyle = 'preserve-3d';
    Object.assign(shadow.style, {
      position: 'absolute',
      width: `${String(290 * unit)}px`,
      height: `${String(135 * unit)}px`,
      translate: '-50% -50%',
      background: 'radial-gradient(ellipse, #070809be, transparent 69%)',
    });
    plane.append(shadow, packet);
    layer.append(plane);
    let seed = 82;
    const packetCards = Array.from({ length: count }, (_, index) => {
      seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
      const { card, strips } = makeSurface(packet, top, back, length, depth, segments);
      return { card, slices: strips, index, jitter: seed / 4294967296 - 0.5 };
    });
    return (time) => {
      const tilt = ease(phase(time, enter)) * (1 - ease(phase(time - enter - riffleTime - bridgeTime, exit)));
      const riffle = phase(time - enter, riffleTime);
      const bridge = phase(time - enter - riffleTime, bridgeTime);
      plane.style.transform = `rotateX(${String(tilt * 79)}deg)`;
      packet.style.transform = `rotateZ(${String(landscape ? 0 : (1 - tilt) * 90)}deg)`;
      const split = ease(riffle / 0.24);
      const square = ease((bridge - 0.7) / 0.22);
      const tap = Math.sin(Math.PI * ease((bridge - 0.91) / 0.09));
      for (const { card, slices, index, jitter } of packetCards) {
        const rank = Math.floor(index / 2);
        const direction = index % 2 === 0 ? -1 : 1;
        const releaseStart = 0.28 + 0.52 * (index + jitter * 0.66) / count;
        const release = ease((riffle - releaseStart) / 0.17);
        const arch = ease(bridge / 0.29) * (1 - ease((bridge - 0.32 - 0.19 * index / count) / 0.23));
        const x = direction * split * mix(78, 22, release) * (1 - square) + 2 * tap;
        const z = mix(index, rank, split * (1 - release)) * pitch;
        const curl = split * (1 - release) * (24 + rank * 0.65);
        const flutter = Math.sin(release * Math.PI * 2) * Math.sin(release * Math.PI) * (3 + 2 * jitter);
        card.style.transformStyle = 'preserve-3d';
        card.style.transform = `translate3d(${String(x * unit)}px, ${String((count - index - 1) * 0.17 * (1 - tilt) * unit)}px, ${String(z * unit)}px)`;
        const bend = (localX: number) => {
          const inner = 0.5 - direction * localX / 132;
          const crown = Math.max(0, 1 - ((x + localX) / (132 / 2 + 22)) ** 2);
          return curl * inner ** 3 + flutter * inner ** 2 + 39 * arch * crown;
        };
        let left = -132 / 2;
        for (const [segment, slice] of slices.entries()) {
          const start = -132 / 2 + segment * sliceWidth;
          const z0 = bend(start);
          const angle = Math.asin(Math.max(-0.86, Math.min(0.86, (bend(start + sliceWidth) - z0) / sliceWidth)));
          slice.style.transform = `translate3d(${String(left * unit)}px, 0, ${String(z0 * unit)}px) rotateY(${String(-angle)}rad)`;
          left += sliceWidth * Math.cos(angle);
        }
      }
    };
  });
}
