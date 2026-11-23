import { boxStyle, clipPathOf, type Box, type Outline } from '../scan-ingest/board.ts'

/** A scanned face: its size in px, its die-cut outline normalised on the upright image, `cutout` for art already cut (transparent ground). */
export interface SleeveImage { width: number; height: number; outline?: Outline | null; cutout?: boolean }
/** The edge of a face where the sleeve opens (the inserts' tabs stick out there): `left` turns the inserts a quarter to the left. */
export type SleeveOpen = 'top' | 'left'
/** Where an insert lies on its host's image, in fractions of the host; `rotate` turns the insert's image first. */
export interface Layer { box: Box; rotate: 0 | -90 }
export interface Tab { top: number; bodyTop: number }

const pct = (n: number): string => `${String(Math.round(n * 10000) / 100)}%`
const elongation = (a: { width: number; height: number }): number => Math.max(a.width, a.height) / Math.max(1, Math.min(a.width, a.height))

/** The clip that cuts an image to its die-cut; none for pre-cut art or no outline. */
export function imageClipOf(img: Pick<SleeveImage, 'outline' | 'cutout'> | null | undefined): string | undefined {
  if (!img || img.cutout === true) return undefined
  return clipPathOf(img.outline)
}

/**
 * Where an insert lies under its host: the cards of a sleeve share their short edge and sit on its floor, so the insert is as wide as
 * the host and runs past the open edge by the part of it that is longer than the host. `null` when an image has no size.
 */
export function insertLayer(host: { width: number; height: number }, insert: { width: number; height: number }, open: SleeveOpen = 'top'): Layer | null {
  if (host.width <= 0 || host.height <= 0 || insert.width <= 0 || insert.height <= 0) return null
  const length = elongation(insert) / elongation(host)
  if (open === 'top') return { box: { x: 0, y: 1 - length, w: 1, h: length }, rotate: 0 }
  return { box: { x: 1 - length, y: 0, w: length, h: 1 }, rotate: -90 }
}

/** The CSS that places an insert's image on its layer, in percentages of the host (`hostRatio`: host width over height). */
export function layerStyle(layer: Layer, hostRatio: number): Record<string, string> {
  const { box } = layer
  if (layer.rotate === 0) return boxStyle(box)
  return { left: pct(box.x + box.w / 2), top: pct(box.y + box.h / 2), width: pct(box.h / hostRatio), height: pct(box.w * hostRatio), transform: 'translate(-50%, -50%) rotate(-90deg)' }
}

/** An insert's tab read from its outline (a centred tab on top): where it begins (`top`) and where the body's shoulders begin (`bodyTop`); `null` without one. */
export function tabOf(outline: Outline | null | undefined, o: { side?: number; min?: number; max?: number } = {}): Tab | null {
  const { side = 0.3, min = 0.03, max = 0.2 } = o
  if (!outline || outline.length < 3) return null
  const shoulders = outline.filter(([x, y]) => (x < side || x > 1 - side) && y < 0.3).map(([, y]) => y)
  const middle = outline.filter(([x]) => x >= side && x <= 1 - side).map(([, y]) => y)
  if (shoulders.length === 0 || middle.length === 0) return null
  const bodyTop = Math.min(...shoulders)
  const top = Math.min(...middle)
  return bodyTop - top >= min && bodyTop - top <= max ? { top, bodyTop } : null
}

/** The clip of the tab alone: the outline with every point below `bodyTop` raised to it. */
export function tabClipOf(outline: Outline, bodyTop: number): string | undefined {
  return clipPathOf(outline.map(([x, y]) => [x, Math.min(y, bodyTop)] as const))
}

/**
 * Where an insert's tab shows, in fractions of the host: its layer moved out past the open edge until its body meets that edge (a tab
 * the host would hide stands its own height out; one already past stays), and `rank` × `step` tab heights further, so each tab behind
 * shows its edge.
 */
export function tabBox(layer: Layer, tab: Tab, rank: number, step = 0.35): Box {
  const { box } = layer
  const along = layer.rotate === 0 ? box.h : box.w
  const start = layer.rotate === 0 ? box.y : box.x
  const out = Math.max(0, start + tab.bodyTop * along) + rank * step * (tab.bodyTop - tab.top) * along
  return layer.rotate === 0 ? { ...box, y: box.y - out } : { ...box, x: box.x - out }
}

/** Inserts are listed from the host's front; seen from `face`, rank 0 is the one nearest the viewer (drawn last). */
export function insertRanks(n: number, face: 'front' | 'back'): number[] {
  return Array.from({ length: n }, (_, i) => (face === 'front' ? i : n - 1 - i))
}

/** A notch cut into the `right` or `bottom` edge: its span along the edge (`from`, `to`) and how far in it reaches (`inner`), in fractions. */
export interface Notch { from: number; to: number; inner: number }

/** The notch read from a host's outline (points well inside the edge, away from the corners); `null` when what is found is not notch-shaped. */
export function notchOf(outline: Outline | null | undefined, edge: 'right' | 'bottom'): Notch | null {
  const depth = (x: number, y: number) => (edge === 'right' ? x : y)
  const along = (x: number, y: number) => (edge === 'right' ? y : x)
  const inside = (outline ?? []).filter(([x, y]) => depth(x, y) > 0.5 && depth(x, y) < 0.92 && along(x, y) > 0.08 && along(x, y) < 0.92)
  if (inside.length < 2) return null
  const spans = inside.map(([x, y]) => along(x, y))
  const n = { from: Math.min(...spans), to: Math.max(...spans), inner: Math.min(...inside.map(([x, y]) => depth(x, y))) }
  return n.to - n.from >= 0.25 && n.inner >= 0.6 && n.inner <= 0.9 ? n : null
}

/** The part `index` of `count` equal parts of a notch, in fractions of the host: where that insert is read. */
export function notchWindow(notch: Notch, index: number, count: number, edge: 'right' | 'bottom'): Box {
  const step = (notch.to - notch.from) / Math.max(1, count)
  const from = notch.from + step * index
  return edge === 'right' ? { x: notch.inner, y: from, w: 1 - notch.inner, h: step } : { x: from, y: notch.inner, w: step, h: 1 - notch.inner }
}
