import { useEffect } from 'react'

/** Optional: Escape closes the zoom before windows under it see the key (EBR Zoom). */
export function useZoomEscape(onClose: () => void, open = true): void {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  }, [onClose, open])
}
