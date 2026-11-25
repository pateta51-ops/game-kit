export interface ScaffoldOptions {
  dir: string
  id: string
  name: string
  kit: string
  ref?: string
  existing?: boolean
  ports?: string
  repo?: string
  runner?: string
  link?: string
  overlay?: string[]
  components?: string[]
  render?: boolean
  install?: boolean
  git?: boolean
}
export const BASE: string[]
export const TEMPLATE: string
export function scaffold(o: ScaffoldOptions): { dir: string; ref: string; ports: Record<string, string | number> & { e2e: number } }

export function existingCheck(o: { dir: string; overlay?: string[]; link?: string }): void
