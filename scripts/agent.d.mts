export interface Io { out: (l: string) => void; err: (l: string) => void }
export type Exec = (cmd: string, args: string[], input: string) => { status: number | null; output: string }
export function parse(args: string[], bools?: string[]): Record<string, string | true> | null
export function toWsl(p: string): string
export function script(src: string, branch: string, id: string, install: string, check: string): string
export function worktree(args: string[], io: Io): number
export function teardown(args: string[], io: Io): number
export interface Bg { start: (dir: string, win: boolean) => void; sleep: (ms: number) => void; now: () => number; home: string }
export function queueJob(exec: Exec, win: boolean, label: string): { down?: true; job?: { id: string; label: string }; state?: 'waiting' | 'running'; ms?: number; ahead?: number } | null
export function finish(args: string[], io: Io, exec?: Exec, win?: boolean, bg?: Bg | null): number
