import { useLayoutEffect, type RefObject } from 'react'
import { fitSize, type FitOptions } from './fit.ts'

/** K235 A9: sets `font-size` (px) on the element so its text fits its box; re-fits when `text` or the box width changes. Text is never cut. */
export function useFitText(ref: RefObject<HTMLElement | null>, text: string, o: FitOptions): void {
  const { min, max, step } = o
  useLayoutEffect(() => {
    const opts: FitOptions = step === undefined ? { min, max } : { min, max, step }
    const el = ref.current
    if (!el) return
    const run = () => {
      const r = fitSize((s) => {
        el.style.fontSize = `${String(s)}px`
        return el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth
      }, opts)
      el.style.fontSize = `${String(r.size)}px`
    }
    run()
    if (typeof ResizeObserver === 'undefined') return
    let w = el.clientWidth
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; run() } })
    ro.observe(el)
    return () => { ro.disconnect() }
  }, [ref, text, min, max, step])
}
