import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFitText } from './fitText.tsx'

// jsdom has no layout: the box is 100 x 100 and the text is as high as its font size times `lines`, so it fits up to 100 / lines px.
const box = (lines: () => number, width: () => number = () => 100) => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return parseFloat(this.style.fontSize) * lines() })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(50)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(width)
}
function Text({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useFitText(ref, text, { min: 6, max: 30 })
  return <div ref={ref} data-testid="t">{text}</div>
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('useFitText (K235 A9, DOM)', () => {
  it('sets the largest font size that fits, and re-fits when the text changes', () => {
    let lines = 4
    box(() => lines)
    const { getByTestId, rerender } = render(<Text text="short" />)
    expect(getByTestId('t').style.fontSize).toBe('25px')
    lines = 10
    rerender(<Text text="a much longer text" />)
    expect(getByTestId('t').style.fontSize).toBe('10px')
  })

  it('keeps the whole text at min when even min overflows', () => {
    box(() => 100)
    const { getByTestId } = render(<Text text="never fits" />)
    expect(getByTestId('t').style.fontSize).toBe('6px')
    expect(getByTestId('t').textContent).toBe('never fits')
  })

  it('re-fits when the box width changes, not for other resizes, and disconnects on unmount', () => {
    let width = 100
    let lines = 4
    box(() => lines, () => width)
    let fire = (): void => undefined
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { fire = cb } observe() { /* none */ } disconnect = disconnect })
    const { getByTestId, unmount } = render(<Text text="x" />)
    expect(getByTestId('t').style.fontSize).toBe('25px')
    lines = 5
    fire()
    expect(getByTestId('t').style.fontSize).toBe('25px')
    width = 50
    fire()
    expect(getByTestId('t').style.fontSize).toBe('20px')
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})
