/* eslint-disable react-hooks/set-state-in-effect -- the shown number is presentation state driven by the count-up */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { countUp } from '../effect-library/index.ts';
import { withReducedMotion, type Speed } from '../motion-frame/index.ts';
import { bumpCounter, crossed, levelOf, showTag, type Level, type Thresholds } from './counter.ts';

export interface CounterProps {
  value: number;
  /** `data-res`: where flights find this counter, e.g. "seat1.gold" */
  anchor: string;
  icon?: ReactNode;
  thresholds?: Thresholds;
  /** the player's pace (default 1); reduced motion is applied here */
  speed?: () => Speed;
  /** called when the count crosses into a worse level */
  onCross?: (level: Level, value: number) => void;
  /** false: the number jumps, no count-up (bump and tag stay) */
  count?: boolean;
  /** false: no bump on a change (a flight bumps on landing with `bumpCounter`); default true */
  bumpOnChange?: boolean;
}

/**
 * A resource number. The shown number counts up to `value` (the stored value is the game's); bump and "+N" tag on a change;
 * `data-level` ok|low|out from the thresholds. A press or key ends the count at once. At speed 0 or reduced motion: the number only.
 */
export function Counter({ value, anchor, icon, thresholds, speed, onCross, count = true, bumpOnChange = true }: CounterProps) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  const mid = useRef(value);
  const el = useRef<HTMLSpanElement>(null);
  const pace = (): Speed => withReducedMotion(speed ? speed() : 1);
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = value;
    if (was === value) return;
    const s = pace();
    if (el.current) {
      if (bumpOnChange) bumpCounter(el.current, s);
      showTag(el.current, value - was, s);
    }
    const c = crossed(was, value, thresholds);
    if (c) onCross?.(c, value);
    if (!count) {
      mid.current = value;
      setShown(value);
      return;
    }
    let live = true;
    const finish = countUp({
      value,
      from: mid.current,
      speed: pace,
      show: (n) => {
        if (!live) return;
        mid.current = n;
        setShown(n);
      },
    });
    window.addEventListener('pointerdown', finish, true);
    window.addEventListener('keydown', finish, true);
    return () => {
      live = false;
      finish();
      window.removeEventListener('pointerdown', finish, true);
      window.removeEventListener('keydown', finish, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span ref={el} data-part="counter" data-res={anchor} data-level={levelOf(value, thresholds)} data-value={value}>
      {icon !== undefined ? <span data-part="icon">{icon}</span> : null}
      <span data-part="number">{shown}</span>
    </span>
  );
}
