/* eslint-disable react-hooks/set-state-in-effect -- the shown step is presentation state driven by the hop */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { paceOf, registerFill, useMarkerGlide, type GlideHook, type Pace } from './glide.ts';
import { bumpCounter } from '../counter/index.ts';
import { landingEffects, wait } from './effects.ts';
import { QUIET_MS } from './ups.ts';
import {
  BADGE_FRAMES, BADGE_IN_MS, PULSE_FRAMES, PULSE_MS, RISE_MS, hopFrames, hopPlan, riseFrames, stateOf, spaceLabel, stepsOf,
  type Space, type StepItem, type TrackWords,
} from './track.ts';


export interface TrackProps extends GlideHook {
  spaces: readonly Space[];
  /** the space the marker is on */
  index: number;
  /** the game's words for the labels */
  words: TrackWords;
  /** the name of the whole track (aria-label) */
  label: string;
  /** the marker's name, shown with it (colour is never the only signal) */
  markerLabel?: ReactNode;
  /** the marker's image, in the mat rendering */
  marker?: ReactNode;
  /** spaces laid on a mat image: one [x, y] per space, fractions 0..1 of the image (board-layout `zonePct` gives them from a layout) */
  mat?: { src: string; spots: readonly (readonly [number, number])[] };
  /** how to draw the value of a space (default: the value; the max space has no value) */
  renderValue?: (space: Space, i: number) => ReactNode;
  /** how to draw one mark and one effect (default: the mark's letter; the effect has no icon) */
  renderMark?: (m: NonNullable<Space['marks']>[number]) => ReactNode;
  renderEffect?: (e: NonNullable<Space['effect']>) => ReactNode;
  /** more pieces on the mat */
  children?: ReactNode;
}

/**
 * A row of spaces with a marker that glides. `ol[data-part=track]` > `li[data-part=space][data-state=past|current|future|skipped]`
 * (`aria-current=step` on the current one, `aria-label` from the game's words) holding `value`, `marks` and the marker `[data-marker]`.
 * With `mat`: the same list at the printed positions over the image (`[data-part=mat]`, `img[data-part=mat-image]`, spaces `data-layout=mat`).
 */
export function Track({ spaces, index, words, label, markerLabel, marker, mat, renderValue, renderMark, renderEffect, children, ...glide }: TrackProps) {
  const list = useRef<HTMLOListElement>(null);
  useMarkerGlide(list, index, glide);
  const onMat = mat !== undefined && mat.spots.length >= spaces.length;
  const ol = (
    <ol ref={list} data-part="track" data-layout={onMat ? 'mat' : 'row'} aria-label={label}>
      {spaces.map((space, i) => {
        const state = stateOf(spaces, index, i);
        const text = spaceLabel(space, i, state, words);
        const p = onMat ? mat.spots[i] : undefined;
        const style: CSSProperties | undefined = p ? { position: 'absolute', left: `${String(p[0] * 100)}%`, top: `${String(p[1] * 100)}%` } : undefined;
        return (
          <li key={i} data-part="space" data-state={state} data-max={space.max ? '' : undefined} style={style} aria-current={state === 'current' ? 'step' : undefined} aria-label={text} title={text}>
            {onMat ? null : <span data-part="value">{renderValue ? renderValue(space, i) : space.max ? null : space.value}</span>}
            {space.marks?.length || space.effect ? (
              <span data-part="marks">
                {space.marks?.map((m) => (
                  <span key={m.id} data-part="mark" data-mark={m.id} aria-hidden="true">
                    {renderMark ? renderMark(m) : m.letter}
                  </span>
                ))}
                {space.effect ? (
                  <span data-part="effect" data-effect={space.effect.id} aria-hidden="true">
                    {renderEffect ? renderEffect(space.effect) : null}
                  </span>
                ) : null}
              </span>
            ) : null}
            {state === 'current' ? (
              <>
                {onMat && marker ? (
                  <span data-part="glide" data-marker>
                    {marker}
                  </span>
                ) : null}
                <span data-part="marker" data-marker={onMat && marker ? undefined : ''}>
                  {markerLabel}
                </span>
              </>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
  if (!onMat) return ol;
  return (
    <div data-part="mat" style={{ position: 'relative' }}>
      <img data-part="mat-image" src={mat.src} alt="" draggable={false} style={{ display: 'block', width: '100%' }} />
      {ol}
      {children}
    </div>
  );
}

export interface HopTrackProps {
  value: number;
  max: number;
  /** the game's multiplier at `value`; a rise to a new one pops the badge */
  mult?: number;
  /** words: the track's name and the "×N" text */
  label: string;
  multText?: (n: number) => string;
  speed?: Pace;
  backward?: boolean | undefined;
  undone?: unknown;
}

/**
 * The hop-and-fill style, as STCC's crew track: on an advance the old number stays and the new badge is hidden while the dot
 * `i[data-part=dot]` hops (360 ms + 120 ms per further step) and the fill (`--v` on `div[data-part=bar]`, drawn by the game) follows.
 * At the hop's end the number ticks to the new value and bumps with a soft `[data-part=light]` behind it; at a new multiplier the badge
 * `[data-part=badge]` pops, two `[data-part=pulse]` rings go out, 22 `[data-part=spark]`s fly and a `[data-part=rise]` "×N" rises;
 * without one the number waits half the light's time. A new value mid-hop ends the run cleanly (animations cancelled, extras removed).
 * Colours: the game's `color` on the badge and number.
 */
export function HopTrack({ value, max, mult = 1, label, multText = (n) => `×${String(n)}`, speed, backward, undone }: HopTrackProps) {
  const [shown, setShown] = useState(value);
  const [hold, setHold] = useState(false);
  const was = useRef({ value, mult, undone });
  const root = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const badge = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [rising, setRising] = useState<number | null>(null);
  const anims = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const p = was.current;
    was.current = { value, mult, undone };
    const s = paceOf(speed);
    const plan = hopPlan(p.value, value, p.mult, mult, { backward, undone: p.undone !== undone, speed: s });
    if (plan.ms <= 0) {
      setShown(value);
      setHold(false);
      return;
    }
    const sp = s as number;
    setShown(p.value);
    setHold(plan.badge);
    registerFill();
    const play = (el: Element | null, frames: Keyframe[], o: KeyframeAnimationOptions): void => {
      if (el && typeof el.animate === 'function') anims.current.push(el.animate(frames, o));
    };
    play(bar.current, [{ '--v': p.value }, { '--v': value }] as Keyframe[], { duration: plan.ms, easing: 'ease-out' });
    const d = dot.current;
    if (d) play(d, hopFrames(d.getBoundingClientRect().height * 0.45), { duration: plan.ms, easing: 'ease-out' });
    let live = true;
    const fx: HTMLElement[] = [];
    void (async () => {
      await wait(plan.ms);
      if (!live) return;
      setShown(value);
      if (num.current) {
        bumpCounter(num.current, s);
        fx.push(...landingEffects(num.current, sp).els);
      }
      if (plan.badge && badge.current) {
        setHold(false);
        const sparks = landingEffects(badge.current, sp, { light: false, sparks: true });
        fx.push(...sparks.els);
        play(badge.current, BADGE_FRAMES, { duration: BADGE_IN_MS * sp, easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)' });
        setRising(plan.mult);
        await Promise.all([sparks.done, wait(RISE_MS * sp)]);
        if (live) setRising(null);
      } else await wait(QUIET_MS * sp);
    })();
    return () => {
      live = false;
      for (const a of anims.current) a.cancel();
      anims.current = [];
      for (const e of fx) e.remove();
      setRising(null);
      setHold(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, undone]);
  useLayoutEffect(() => {
    if (rising === null) return;
    const s = paceOf(speed) as number;
    const mine: Animation[] = [];
    for (const el of root.current?.querySelectorAll<HTMLElement>('[data-part=pulse]') ?? []) {
      if (typeof el.animate === 'function') mine.push(el.animate(PULSE_FRAMES, { duration: PULSE_MS * s, delay: Number(el.dataset['k']) * PULSE_MS * 0.55 * s, easing: 'ease-out', fill: 'backwards' }));
    }
    const r = root.current?.querySelector<HTMLElement>('[data-part=rise]');
    if (r && typeof r.animate === 'function') mine.push(r.animate(riseFrames(parseFloat(getComputedStyle(r).fontSize) || 16), { duration: RISE_MS * s, easing: 'ease-out' }));
    return () => {
      for (const a of mine) a.cancel();
    };
  }, [rising, speed]);
  return (
    <div ref={root} data-part="hop-track" role="group" aria-label={label} data-value={value} data-max={max}>
      <div ref={bar} data-part="bar" style={{ '--v': shown } as CSSProperties}>
        <i ref={dot} data-part="dot" data-marker />
      </div>
      <span ref={num} data-part="number">
        {shown}
      </span>
      {mult > 1 ? (
        <span ref={badge} data-part="badge" data-mult={mult} style={hold ? { visibility: 'hidden' } : undefined}>
          {multText(mult)}
          {rising === null ? null : (
            <>
              {Array.from({ length: 2 }, (_, k) => (
                <span key={k} data-part="pulse" data-k={k} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
              ))}
              <span data-part="rise" aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', textAlign: 'center', pointerEvents: 'none' }}>
                {multText(rising)}
              </span>
            </>
          )}
        </span>
      ) : null}
    </div>
  );
}

/*
 * StepTrack: the structure of PhaseTracker.vue (halogenandtoast/LordOfTheRings, BSD-3-Clause; notice in LICENSE-LordOfTheRings.txt),
 * as ported in Star Trek: Captain's Chair `StepTrack.tsx`: ol > li[aria-current=step] > span.name.
 */
/** A list of steps, every name shown, one lit: `ol[data-part=steps] > li[data-part=step][data-lit] > span[data-part=name]`. */
export function StepTrack({ steps, current, label }: { steps: readonly StepItem[]; current: string | null; label: string }) {
  return (
    <ol data-part="steps" aria-label={label} data-step={current ?? 'none'}>
      {stepsOf(steps, current).map((s) => (
        <li key={s.id} data-part="step" data-step-id={s.id} data-lit={s.lit ? '' : undefined} aria-current={s.lit ? 'step' : undefined}>
          <span data-part="name">{s.name}</span>
        </li>
      ))}
    </ol>
  );
}
