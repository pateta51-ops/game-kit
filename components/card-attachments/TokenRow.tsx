import type { ReactNode } from 'react'
import { ROW_MAX, tokenRow, type Dir } from './tokens.ts'

/** The tokens of one kind in a row: one each up to `max`, past it one token and "×N". The game draws a token (`render`) and the ×N chip (`times`). */
export function TokenRow({ count, render, kind, max = ROW_MAX, times, label, cls = (p) => `kc-${p}` }: { count: number; render: (i: number) => ReactNode; kind?: string; max?: number; times?: (n: number) => ReactNode; label?: string; cls?: (part: string) => string }) {
  if (count <= 0) return null
  const row = tokenRow(count, max)
  return (
    <div className={cls('token-row')} data-part="token-row" data-kind={kind} data-count={count} role="img" aria-label={label ?? `${count} ${kind ?? 'tokens'}`} style={{ display: 'flex', alignItems: 'flex-end' }}>
      {Array.from({ length: row.tokens }, (_, i) => (
        <span key={i} className={cls('token')} data-part="token">{render(i)}</span>
      ))}
      {row.times !== null ? <span className={cls('token-times')} data-part="token-times" data-times={row.times}>{times ? times(row.times) : `×${row.times}`}</span> : null}
    </div>
  )
}

/** A number box that counts down; a number an effect changed is marked `data-dir`, a box at 0 `data-zero`. The game draws it (`render`) or gets the plain value. A number that bumps or flies: `counter`, `token-flights`. */
export function NumberBox({ value, dir, zero, kind, render, label, cls = (p) => `kc-${p}` }: { value: number; dir?: Dir | undefined; zero?: boolean; kind?: string; render?: (s: { value: number; dir?: Dir | undefined; zero: boolean }) => ReactNode; label?: string; cls?: (part: string) => string }) {
  return (
    <span className={cls('number-box')} data-part="number-box" data-kind={kind} data-value={value} data-dir={dir} data-zero={zero ? 'true' : undefined} role="img" aria-label={label ?? `${kind ?? 'number'} ${value}`}>
      {render ? render({ value, dir, zero: !!zero }) : value}
    </span>
  )
}
