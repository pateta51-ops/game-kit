export type Frame = { data: string; t: number };

// ms from the beat's start for the stills: the start, up to four step ends (spread over them, the last end excluded), then the rest state is the last frame
export const stillTimes = (spec: { steps: { t: number; dur: number }[] }, steps = 4): number[] => {
  const ends = [...new Set(spec.steps.map((x) => x.t + x.dur))].sort((x, y) => x - y).slice(0, -1).filter((x) => x > 0);
  const pick = ends.length <= steps ? ends : Array.from({ length: steps }, (_, k) => ends[Math.round(((k + 1) * (ends.length - 1)) / steps)] as number);
  return [0, ...pick];
};

// a frame stays until the next one (seconds)
export const frameAt = (frames: Frame[], t: number): Frame | undefined => [...frames].reverse().find((f) => f.t <= t) ?? frames[0];

// the frame times (seconds) of a clip at a fixed rate, from `lead` s before `at` to `ms` after it
export const clipTimes = (at: number, ms: number, fps = 30, lead = 0.4): number[] => {
  const out: number[] = [];
  for (let t = at - lead; t <= at + ms / 1000; t += 1 / fps) out.push(t);
  return out;
};

// the six frames of the stills sheet: one per stillTimes entry (ms after `at`), then the last frame
export const stillFrames = (frames: Frame[], at: number, times: number[]): Frame[] => [...times.map((x) => frameAt(frames, at + x / 1000)), frames[frames.length - 1]].filter((f): f is Frame => !!f);
