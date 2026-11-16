import type { ScaffoldOptions } from './scaffold.js'
export interface NewGameOptions extends ScaffoldOptions {
  remote?: boolean
  exec?: (cmd: string, args: string[], opts?: { cwd?: string }) => string
  scaffold?: (o: ScaffoldOptions) => unknown
  log?: (s: string) => void
}
export function newGame(o: NewGameOptions): string[]
export const BASE: string[]
export const TEMPLATE: string
export function scaffold(o: ScaffoldOptions): { dir: string; ref: string; ports: Record<string, string | number> }
