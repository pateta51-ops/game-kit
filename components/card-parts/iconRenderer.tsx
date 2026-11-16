import type { ReactNode } from 'react'
import { Icon, type Cls } from './parts.tsx'
import type { IconSet } from './text.ts'

/** K235 A7: the bridge to glossary: pass as `<GlossaryProvider renderIcon>`; a code the set lacks gives null (glossary shows its term). */
export const iconRenderer = (icons: IconSet, cls: Cls = (p) => `kc-${p}`, size?: string) => (code: string): ReactNode => {
  const def = icons[code]
  return def === undefined ? null : <Icon def={def} name={code} cls={cls} {...(size ? { size } : {})} />
}
