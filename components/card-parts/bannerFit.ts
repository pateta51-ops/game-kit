export const LINE = 1.15

/** Font size (px) at which a word `em` ems wide, on a bar of height LINE em, has all four corners of its box inside a w x h card with a margin (3 % of the short side); the bar's angle is atan(h/w). */
export function bannerFit(w: number, h: number, em: number): number {
  if (!(w > 0 && h > 0 && em > 0)) return 0
  const t = Math.atan2(h, w), c = Math.cos(t), s = Math.sin(t), m = 0.03 * Math.min(w, h), hb = LINE / 2 + 0.03
  const fs = Math.min((w / 2 - m) / ((em / 2) * c + hb * s), (h / 2 - m) / ((em / 2) * s + hb * c))
  return Math.max(0, Math.min(fs, 0.22 * Math.hypot(w, h)))
}
