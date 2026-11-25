import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HostStack, NumberBox, TokenRow } from './ui.ts'

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, node: <i>back</i> }))
const part = (c: HTMLElement, p: string) => [...c.querySelectorAll<HTMLElement>(`[data-part="${p}"]`)]

describe('HostStack', () => {
  it('tucks the attachments under the host and slides them out on hover', () => {
    const { container } = render(<HostStack host={<b>host</b>} attachments={cards(2)} w={100} h={140} ms={0} />)
    const root = part(container, 'host-stack')[0]!
    expect(root.style.width).toBe('128px')
    expect(part(container, 'attachment').map((a) => a.style.left)).toEqual(['14px', '28px'])
    fireEvent.pointerEnter(root)
    expect(root.dataset.open).toBe('true')
    expect(part(container, 'attachment').map((a) => a.style.left)).toEqual(['112px', '224px'])
    fireEvent.pointerLeave(root)
    expect(root.dataset.open).toBe('false')
  })
  it('a click on a mouse keeps the hovered stack open; on touch it toggles', () => {
    const { container } = render(<HostStack host="h" attachments={cards(1)} w={100} h={140} />)
    const root = part(container, 'host-stack')[0]!
    fireEvent.pointerEnter(root, { pointerType: 'mouse' })
    fireEvent.click(root)
    expect(root.dataset.open).toBe('true')
    fireEvent.pointerLeave(root)
    fireEvent.pointerDown(root, { pointerType: 'touch' })
    fireEvent.click(root)
    expect(root.dataset.open).toBe('true')
    fireEvent.click(root)
    expect(root.dataset.open).toBe('false')
  })
  it('fans upward with the host lowest, and puts no card key in the DOM', () => {
    const { container } = render(<HostStack host="h" attachments={cards(2)} w={100} h={200} mode="fan" fanStep={0.1} />)
    expect(part(container, 'host')[0]!.style.top).toBe('40px')
    expect(part(container, 'attachment').map((a) => a.style.top)).toEqual(['20px', '0px'])
    expect(container.innerHTML).not.toContain('k0')
  })
  it('reports a tap on an attachment by index', () => {
    const onRead = vi.fn()
    const { container } = render(<HostStack host="h" attachments={cards(2)} w={100} h={140} onRead={onRead} />)
    fireEvent.click(part(container, 'attachment')[1]!)
    expect(onRead).toHaveBeenCalledWith(1, 'k1')
  })
  it.each(['tuck', 'fan'] as const)('reads a %s attachment once with Enter or Space without scrolling', (mode) => {
    const onRead = vi.fn()
    const { container } = render(<HostStack host="h" attachments={[{ key: 'a', node: <i>back</i>, turned: true }]} w={100} h={140} mode={mode} onRead={onRead} />)
    const attachment = part(container, 'attachment')[0]!
    attachment.focus()
    expect(document.activeElement).toBe(attachment)
    expect(fireEvent.keyDown(attachment, { key: 'Enter' })).toBe(false)
    fireEvent.keyUp(attachment, { key: 'Enter' })
    expect(onRead).toHaveBeenCalledTimes(1)
    expect(fireEvent.keyDown(attachment, { key: ' ' })).toBe(false)
    fireEvent.keyDown(attachment, { key: ' ', repeat: true })
    fireEvent.keyUp(attachment, { key: ' ' })
    expect(onRead).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(attachment, { key: 'a' })
    fireEvent.keyDown(attachment, { key: 'Enter', ctrlKey: true })
    expect(onRead).toHaveBeenCalledTimes(2)
    fireEvent.click(attachment)
    expect(onRead).toHaveBeenCalledTimes(3)
    expect(onRead).toHaveBeenLastCalledWith(0, 'a')
  })
  it('leaves nested controls to the game and non-readable attachments unfocusable', () => {
    const onRead = vi.fn()
    const action = vi.fn()
    const { container, rerender } = render(<HostStack host="h" attachments={[{ key: 'a', node: <button onClick={action}>Choose</button> }]} w={100} h={140} onRead={onRead} />)
    const button = container.querySelector('button')!
    fireEvent.keyDown(button, { key: 'Enter' })
    fireEvent.keyUp(button, { key: 'Enter' })
    fireEvent.click(button)
    expect(action).toHaveBeenCalledTimes(1)
    expect(onRead).not.toHaveBeenCalled()
    rerender(<HostStack host="h" attachments={cards(1)} w={100} h={140} />)
    const attachment = part(container, 'attachment')[0]!
    expect(attachment).not.toHaveAttribute('role')
    expect(attachment).not.toHaveAttribute('tabindex')
    fireEvent.keyDown(attachment, { key: 'Enter' })
    expect(onRead).not.toHaveBeenCalled()
  })
  it.each(['wrapped', 'linked'] as const)('leaves a %s checkbox label to its associated control', (kind) => {
    const onRead = vi.fn(), change = vi.fn()
    const input = <input id="attachment-choice" type="checkbox" onChange={change} />
    const node = kind === 'wrapped' ? <label>Toggle {input}</label> : <><label htmlFor="attachment-choice">Toggle</label>{input}</>
    const { getByText, getByRole } = render(<HostStack host="h" attachments={[{ key: 'a', node }]} w={100} h={140} onRead={onRead} />)
    fireEvent.click(getByText('Toggle'))
    expect(change).toHaveBeenCalledTimes(1)
    expect(getByRole('checkbox')).toBeChecked()
    expect(onRead).not.toHaveBeenCalled()
  })
})

describe('TokenRow and NumberBox', () => {
  it('draws one token each, then one and a x N', () => {
    const { container, rerender } = render(<TokenRow kind="harm" count={3} render={() => <u />} />)
    expect(part(container, 'token')).toHaveLength(3)
    rerender(<TokenRow kind="harm" count={7} render={() => <u />} />)
    expect(part(container, 'token')).toHaveLength(1)
    expect(part(container, 'token-times')[0]!.textContent).toBe('×7')
    rerender(<TokenRow kind="harm" count={0} render={() => <u />} />)
    expect(container.innerHTML).toBe('')
  })
  it('marks a changed and a zero box', () => {
    const { container } = render(<NumberBox kind="harm" value={0} dir="bad" zero />)
    const b = part(container, 'number-box')[0]!
    expect([b.dataset.dir, b.dataset.zero, b.textContent]).toEqual(['bad', 'true', '0'])
  })
})
