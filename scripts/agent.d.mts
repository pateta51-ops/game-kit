export interface Io { out: (l: string) => void; err: (l: string) => void }
export type Exec = (cmd: string, args: string[], input: string) => { status: number | null; output: string }
export function parse(args: string[], bools?: string[]): Record<string, string | true> | null
export function toWsl(p: string): string
export function script(src: string, branch: string, id: string, install: string, check: string): string
export function worktree(args: string[], io: Io): number
export function teardown(args: string[], io: Io): number
export interface Bg { start: (cmd: string, args: string[], dir: string, env?: Record<string, string>) => void; sleep: (ms: number) => void; now: () => number; home: string }
export function queueJob(exec: Exec, win: boolean, label: string): { down?: true; job?: { id: string; label: string }; state?: 'waiting' | 'running'; ms?: number; ahead?: number } | null
export function finish(args: string[], io: Io, exec?: Exec, win?: boolean, bg?: Bg | null): number
export const BUILT_NEW_LINE: string
export function builtNewIgnore(repo: string): { globs: string[]; probs: string[] }
export function newSrcFiles(repo: string, ign?: string[]): string[] | null
export const TIMERS: string[]
export function newExports(repo: string, ign?: string[]): string[] | null
export function searchPart(output: string): string | null
export function builtNew(files: string[], body: string, search?: (words: string) => string): string[]
export function launch(win: boolean, dir: string): { cmd: string; args: string[]; env: Record<string, string> }
export function byHand(win: boolean, dir: string): string
export const realBg: Bg & { start: (cmd: string, args: string[], dir: string, env?: Record<string, string>, sp?: unknown) => void }
