import { createElement as h } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { TokenFlights, FLIGHT_MS, STAGGER_MS, createFlightLedger, shownTokens, useFlightLedger } from '../../components/token-flights/ui.ts';
import { TokenBag, getFallback, rateFor, FALLBACK_TEXT, subscribeFallback, totalDuration } from '../../components/token-bag/ui.ts';
import { Track, HopTrack, StepTrack, glideMs, hopPlan, GLIDE_MS } from '../../components/track/index.ts';

export { FLIGHT_MS, STAGGER_MS, GLIDE_MS, glideMs, hopPlan, totalDuration, FALLBACK_TEXT, getFallback, subscribeFallback };

const spaces = Array.from({ length: 8 }, (_, i) => ({ value: i + 1 }));
const words = { space: (n) => `Space ${n}`, value: String, max: 'Last space', skipped: 'Skipped', here: 'Marker here' };
export const steps = [
  { id: 'prepare', name: 'Prepare' },
  { id: 'act', name: 'Act' },
  { id: 'resolve', name: 'Resolve' },
  { id: 'finish', name: 'Finish' },
];

const face = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#e9c46a" stroke="#fcdda0" stroke-width="2"/><circle cx="32" cy="32" r="23" fill="none" stroke="#947038" stroke-width="2"/><path d="M32 16 45 32 32 48 19 32Z" fill="#947038"/></svg>',
);
const faceUrl = () => face;
const supplyOf = (place) => place === 'tray' ? 'bank' : undefined;

function Counter({ label, place, tokens, ledger, size }) {
  const shown = shownTokens(tokens, place, useFlightLedger(ledger));
  return h('div', { className: 'counter', 'data-place': place },
    h('span', null, label),
    h('div', { className: 'coins', 'aria-hidden': 'true' }, shown.slice(0, 4).map((v) =>
      h('img', { key: v, src: face, width: size, height: size, alt: '' }))),
    h('strong', null, shown.length),
  );
}

function Transfer({ stage, effect, s, moved, draw, finishDraw, ledger, hold }) {
  const bag = effect !== 'flight';
  const tokens = Array.from({ length: s.count }, (_, i) => i + 1);
  const size = s.size ?? 30;
  const placement = { tray: moved ? tokens : [] };
  return h('div', { className: 'transfer' },
    bag ? h(TokenBag, {
      count: 12 - (draw || moved ? s.count : 0),
      place: 'bank', chosen: effect === 'bag3d' ? '3d' : '2d', speed: s.speed, faceUrl, draw, onDrawDone: finishDraw,
      children: h('div', { className: 'bag-face' }, 'Bag', h('strong', null, 12 - (moved ? s.count : 0))),
    }) : h(Counter, { label: 'Supply', place: 'bank', tokens: moved ? [] : tokens, ledger, size }),
    h(Counter, { label: 'Tray', place: 'tray', tokens: placement.tray, ledger, size }),
    h(TokenFlights, {
      placement, supplyOf, ledger, speed: s.speed,
      render: () => ({ src: face, size }),
      find: (place) => stage.querySelector(`[data-place="${place}"]`),
      flightMs: s.flightMs, staggerMs: s.staggerMs, maxFlying: s.maxFlying >= 0 ? s.maxFlying : undefined, hold,
      enabled: effect !== 'bag3d' || getFallback() !== null || rateFor(s.speed) === 0,
    }),
  );
}

export function mount(stage) {
  const root = createRoot(stage);
  let run = 0;
  let timers = [];
  return (effect, s, play) => {
    const key = ++run;
    for (const timer of timers) clearTimeout(timer);
    timers = [];
    if (effect === 'flight' || effect.startsWith('bag')) {
      const ledger = createFlightLedger();
      const hold = s.holdMs ? (_, launch) => timers.push(setTimeout(launch, s.holdMs)) : undefined;
      const finishDraw = (done) => { if (done === run) root.render(frame(true, null)); };
      const frame = (moved, draw = null) => h(Transfer, { key, stage, effect, s, moved, draw, finishDraw, ledger, hold });
      flushSync(() => root.render(frame(false)));
      if (play && effect === 'flight') root.render(frame(true));
      if (play && effect !== 'flight') {
        root.render(frame(false, { key, left: Array(12 - s.count).fill('coin'), drawn: Array(s.count).fill('coin') }));
      }
      return;
    }
    const speed = () => s.speed;
    const start = s.reverse ? s.distance : 0;
    const end = s.reverse ? 0 : s.distance;
    const frame = (moved) => {
      switch (effect) {
        case 'glide':
          return h(Track, { key, spaces, words, label: 'Marker track', markerLabel: 'Marker', index: moved ? end : start, speed, backward: Boolean(s.backward) });
        case 'hop': {
          const at = moved ? end : start;
          return h(HopTrack, { key, label: 'Progress', max: 8, value: at, mult: at === s.distance ? s.mult : 1, speed, backward: Boolean(s.backward) });
        }
        default:
          return h(StepTrack, { key, steps, label: 'Step list', current: steps[s.current - 1]?.id ?? null });
      }
    };
    flushSync(() => root.render(frame(false)));
    if (play && effect !== 'steps') root.render(frame(true));
  };
}
