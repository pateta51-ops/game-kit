// Where a move starts and ends, and when a live piece may show: a slot held empty until its ghost lands, pile and host
// rects as anchors, a per-card entry description. Pure; the game draws. Opt-in.
export interface Rect { x: number; y: number; w: number; h: number }

/** A slot held empty until its ghost lands. `latest` is the latest landing time (ms) known up front; `tighten` can
 * only bring it earlier; `release` frees the slot when no ghost could be placed; past `latest` it is free anyway. */
export function createSlotHold(): { hold(id: string, latest: number): void; tighten(id: string, latest: number): void; release(id: string): void; held(id: string, now: number): boolean } {
  const m = new Map<string, number>();
  return {
    hold: (id, latest) => void m.set(id, latest),
    tighten(id, latest) {
      const c = m.get(id);
      if (c !== undefined && latest < c) m.set(id, latest);
    },
    release: (id) => void m.delete(id),
    held(id, now) {
      const c = m.get(id);
      if (c === undefined) return false;
      if (now >= c) m.delete(id);
      return now < c;
    },
  };
}

export interface Anchors { card(id: string): Rect | undefined; pile(id: string): Rect | undefined; host(id: string): string | undefined }
/** Card rect, else the pile rect of its zone, else its host's rect (an attachment), else none. */
export function resolveRect(id: string, a: Anchors, depth = 4): Rect | undefined {
  const h = a.host(id);
  return a.card(id) ?? a.pile(id) ?? (h !== undefined && depth > 0 ? resolveRect(h, a, depth - 1) : undefined);
}
/** A move with no rect at either end simply appears (or vanishes); with one end it comes from or goes to that end. */
export function moveEnds(id: string, from: Anchors, to: Anchors): { kind: 'move' | 'appear' | 'vanish' | 'none'; from?: Rect; to?: Rect } {
  const f = resolveRect(id, from);
  const t = resolveRect(id, to);
  if (f && t) return { kind: 'move', from: f, to: t };
  if (t) return { kind: 'appear', to: t };
  if (f) return { kind: 'vanish', from: f };
  return { kind: 'none' };
}

export type Land = 'squash' | 'pop' | 'none';
export type Leave = 'shake-shrink' | 'glide' | 'fade';
export interface Placed { rect: Rect; faceUp?: boolean }
export interface Motion { id: string; from?: Rect; to: Rect; scale: number; flip: boolean; delay: number; arc: number; land: Land }
export interface EntryOpts { origin?: Rect; stagger?: number; places?: number; arc?: number; scale?: number; land?(id: string): Land; leave?(id: string): Leave }

/** One Motion per card whose rect or face changed between two layouts: start scale, a flip at the midpoint
 * (face-down before, face-up after), a wait its turn (stagger ms, at most `places` places), a rise on an `arc` px arc,
 * a land type. A card new to the layout starts at `origin`. Leaving cards are ghosts with a style. */
export function entryMotions(prev: Record<string, Placed>, next: Record<string, Placed>, o: EntryOpts = {}): { moves: Motion[]; ghosts: { id: string; rect: Rect; style: Leave }[] } {
  const moves: Motion[] = [];
  let turn = 0;
  for (const [id, n] of Object.entries(next)) {
    const p = prev[id];
    const same = p && p.faceUp === n.faceUp && p.rect.x === n.rect.x && p.rect.y === n.rect.y && p.rect.w === n.rect.w && p.rect.h === n.rect.h;
    if (same) continue;
    const from = p?.rect ?? o.origin;
    moves.push({
      id, ...(from ? { from } : {}), to: n.rect,
      scale: from ? from.w / (n.rect.w || 1) : o.scale ?? 1,
      flip: p !== undefined && p.faceUp !== n.faceUp,
      delay: Math.min(turn, (o.places ?? 5) - 1) * (o.stagger ?? 90),
      arc: from ? (o.arc ?? 24) : 0,
      land: o.land?.(id) ?? 'none',
    });
    turn += 1;
  }
  const ghosts = Object.entries(prev).filter(([id]) => !(id in next)).map(([id, p]) => ({ id, rect: p.rect, style: o.leave?.(id) ?? 'fade' }));
  return { moves, ghosts };
}
