import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { fanFootprint, fanSpots, faceBox, footprint, outSpots, tuckSpots, tuckedTurned, type FanDir, type Spot, type Tuck } from './geometry.ts'

export interface StackCard { key: string | number; node: ReactNode; turned?: boolean }
export interface HostStackProps {
  host: ReactNode
  hostTurned?: boolean
  /** Bottom first. Face-down ones: pass a back as `node`; nothing of the card reaches the DOM but `key` as the React key. */
  attachments: readonly StackCard[]
  /** One card's upright size in px. */
  w: number
  h: number
  /** `tuck` (default): each shows an L under the host and slides out on hover or focus. `fan`: each peeks out past the host in `fanDir`. */
  mode?: 'tuck' | 'fan'
  side?: 'right' | 'left'
  tuck?: Tuck
  fanDir?: FanDir
  fanStep?: number
  /** Controlled slid-out state; else hover, focus and a click on the stack toggle it. */
  open?: boolean
  /** Read an attachment by click, Enter or Space; nested controls keep their own actions. */
  onRead?: (index: number, key: string | number) => void
  /** Slide time in ms; 0 for none (the game passes its speed setting). */
  ms?: number
  cls?: (part: string) => string
}

function Slot({ at, w, h, turned, ms, z, part, cls, children, ...rest }: { at: Spot; w: number; h: number; turned: boolean; ms: number; z: number; part: string; cls: (p: string) => string; children: ReactNode } & Record<string, unknown>) {
  const b = faceBox({ turned }, w, h)
  const style: CSSProperties = { position: 'absolute', left: at.x, top: at.y, width: b.w, height: b.h, zIndex: z, transition: ms ? `left ${ms}ms ease, top ${ms}ms ease` : 'none' }
  return (
    <div className={cls(part)} data-part={part} data-turned={turned ? 'true' : undefined} style={style} {...rest}>
      <div style={{ position: 'absolute', left: (b.w - w) / 2, top: (b.h - h) / 2, width: w, height: h, transform: turned ? 'rotate(90deg)' : undefined }}>{children}</div>
    </div>
  )
}

/** A host card with cards tucked under it (visible L, slide out on hover) or fanned past it. */
export function HostStack({ host, hostTurned, attachments, w, h, mode = 'tuck', side = 'right', tuck, fanDir = 'up', fanStep, open: openProp, onRead, ms = 160, cls = (p) => `kc-${p}` }: HostStackProps) {
  const [hover, setHover] = useState(false)
  const ptr = useRef('')
  const fan = mode === 'fan'
  const open = !fan && (openProp ?? hover)
  const hb = { turned: !!hostTurned }
  const ab = attachments.map((a) => ({ turned: !!a.turned }))
  const fo = { dir: fanDir, ...(fanStep === undefined ? {} : { step: fanStep }) }
  const fp = fan ? fanFootprint(attachments.length, w, h, fo) : { ...footprint(hb, ab, w, h, tuck), host: { x: 0, y: 0 } }
  const shown = fan ? fanSpots(attachments.length, w, h, fo).map((s) => ({ x: s.x + fp.host.x, y: s.y + fp.host.y })) : open ? outSpots(hb, ab, w, h, side) : tuckSpots(hb, ab, w, h, tuck)
  const n = attachments.length
  return (
    <div
      className={cls('host-stack')}
      data-part="host-stack"
      data-mode={mode}
      data-open={open ? 'true' : 'false'}
      data-count={n}
      style={{ position: 'relative', width: fp.w, height: fp.h }}
      {...(openProp === undefined && !fan ? { onPointerEnter: (e: { pointerType: string }) => { ptr.current = e.pointerType; setHover(true) }, onPointerDown: (e: { pointerType: string }) => { ptr.current = e.pointerType }, onPointerLeave: () => setHover(false), onFocus: () => setHover(true), onBlur: () => setHover(false), onClick: () => setHover((v) => ptr.current === 'mouse' || !v) } : {})}
    >
      {attachments.map((a, i) => (
        <Slot
          key={a.key}
          at={shown[i]!}
          w={w}
          h={h}
          turned={fan || open ? !!a.turned : tuckedTurned(hb, ab[i]!)}
          ms={ms}
          z={n - i}
          part="attachment"
          cls={cls}
          data-index={i}
          {...(onRead ? {
            role: 'button', tabIndex: 0,
            onClick: (e: MouseEvent<HTMLDivElement>) => {
              const target = e.target instanceof Element ? e.target : null
              if (e.defaultPrevented || target?.closest<HTMLLabelElement>('label')?.control || (target && target.closest('button, a[href], input, select, textarea, [role="button"], [contenteditable]:not([contenteditable="false"])') !== e.currentTarget)) return
              e.stopPropagation(); onRead(i, a.key)
            },
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.defaultPrevented || e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'Enter' && e.key !== ' ')) return
              e.preventDefault(); e.stopPropagation()
              if (!e.repeat) onRead(i, a.key)
            },
          } : {})}
        >
          {a.node}
        </Slot>
      ))}
      <Slot at={fp.host} w={w} h={h} turned={!!hostTurned} ms={0} z={n + 1} part="host" cls={cls}>{host}</Slot>
    </div>
  )
}
