// K235 A9: shrink text to fit its box, never drop it. Pure arithmetic; `fits(px)` is the game's measure (a browser reads scroll vs client size).
export interface FitOptions { min: number; max: number; step?: number }
export interface Fitted { size: number; /** false: even `min` overflows (the text stays whole; the game shortens the words or enlarges the zone). */ fits: boolean }

/** The largest size in [min, max] (on `step`, default 0.5) for which `fits` is true; `min` with `fits: false` when none does. Binary search, so `fits` must only get harder as the size grows. */
export function fitSize(fits: (size: number) => boolean, { min, max, step = 0.5 }: FitOptions): Fitted {
  if (fits(max)) return { size: max, fits: true }
  if (!fits(min)) return { size: min, fits: false }
  let lo = 0
  let hi = Math.floor((max - min) / step)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(min + mid * step)) lo = mid
    else hi = mid - 1
  }
  return { size: min + lo * step, fits: true }
}

/** Content test: for each zone the longest text and the size it gets; `bad` lists the zones where even `min` overflows. */
export function fitReport(entries: readonly { zone: string; text: string }[], fits: (zone: string, text: string, size: number) => boolean, o: FitOptions): { rows: { zone: string; text: string; size: number; fits: boolean }[]; bad: string[] } {
  const longest = new Map<string, string>()
  for (const e of entries) if (e.text.length > (longest.get(e.zone)?.length ?? -1)) longest.set(e.zone, e.text)
  const rows = [...longest].map(([zone, text]) => ({ zone, text, ...fitSize((s) => fits(zone, text, s), o) }))
  return { rows, bad: rows.filter((r) => !r.fits).map((r) => r.zone) }
}
