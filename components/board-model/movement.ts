import type { Board } from './index.ts';

/** null blocks a step; a nonnegative integer is its movement-point cost. */
export type StepCost = (from: string, to: string) => number | null;
export interface MovementOptions {
  readonly points: number;
  readonly cost: StepCost;
  /** A legal destination where movement must end, e.g. enemy zone of control. */
  readonly stop?: (space: string) => boolean;
  /** Whether the piece can finish here, distinct from passing through. */
  readonly end?: (space: string) => boolean;
}
export interface Destination {
  readonly space: string;
  readonly cost: number;
  readonly path: readonly string[];
}
const has = (board: Board, id: string): boolean => Object.hasOwn(board.spaces, id);
function checkedCost(cost: number | null): number | null {
  if (cost !== null && (!Number.isSafeInteger(cost) || cost < 0)) throw new Error('movement step cost must be a nonnegative safe integer or null');
  return cost;
}
function checkedPoints(points: number): void {
  if (!Number.isSafeInteger(points) || points < 0) throw new Error('movement points must be a nonnegative safe integer');
}

/** Cheapest legal route per reachable destination. Board order breaks equal-cost ties. */
export function reachableMoves(board: Board, from: string, options: MovementOptions): Destination[] {
  if (!has(board, from)) throw new Error('unknown movement origin ' + from);
  checkedPoints(options.points);
  const order = new Map(board.order.map((id,i) => [id,i]));
  const best = new Map<string, Destination>([[from,{space:from,cost:0,path:[from]}]]);
  const frontier = new Map(best);
  while (frontier.size) {
    let next: Destination | undefined;
    for (const route of frontier.values()) {
      if (!next || route.cost < next.cost || (route.cost === next.cost &&
        (order.get(route.space) ?? 0) < (order.get(next.space) ?? 0))) next = route;
    }
    if (!next) break;
    frontier.delete(next.space);
    if (next.space !== from && options.stop?.(next.space)) continue;
    for (const to of board.adjacency[next.space] ?? []) {
      if (!has(board,to)) throw new Error('unknown adjacent space ' + to);
      if (best.has(to) && !frontier.has(to)) continue;
      const cost = checkedCost(options.cost(next.space,to));
      if (cost === null || cost > options.points-next.cost) continue;
      const total = next.cost+cost;
      if ((best.get(to)?.cost ?? Infinity) <= total) continue;
      const route = {space:to,cost:total,path:[...next.path,to]};
      frontier.set(to,route);
      best.set(to,route);
    }
  }
  return board.order.flatMap(id => {
    const found=best.get(id);
    return id!==from && found!==undefined && (options.end?.(id) ?? true) ? [found] : [];
  });
}

export interface Displacement {
  readonly path: readonly string[];
  readonly destination: string;
  readonly moved: number;
  readonly remaining: number;
  readonly stop: 'complete' | 'blocked' | 'endOfLine' | 'interrupted';
}
export interface DisplacementOptions {
  readonly steps: number;
  readonly blocked?: (from: string, to: string) => boolean;
  readonly stop?: (space: string) => boolean;
}

/** Follow a game-supplied straight line (push or pull); do not infer geometry or collision rules. */
export function displaceAlong(board: Board, from: string, line: readonly string[], options: DisplacementOptions): Displacement {
  if (!has(board,from)) throw new Error('unknown displacement origin ' + from);
  checkedPoints(options.steps);
  const path=[from];
  let at=from;
  const finish = (stop: Displacement['stop']): Displacement => ({
    path, destination:at,moved:path.length-1,remaining:options.steps-(path.length-1),stop,
  });
  for(let i=0;i<options.steps;i++){
    const to=line[i];
    if(to===undefined)return finish('endOfLine');
    if(!has(board,to)||!(board.adjacency[at]??[]).includes(to))return finish('blocked');
    if(path.includes(to))throw new Error('displacement line repeats a space');
    if(options.blocked?.(at,to))return finish('blocked');
    path.push(to);
    at=to;
    if(i+1<options.steps&&options.stop?.(to))return finish('interrupted');
  }
  return finish('complete');
}

export interface PieceDisplacement {
  readonly piece: string;
  readonly from: string;
  readonly to: string;
}

export interface ChainDisplacement extends Omit<Displacement, 'path'> {
  readonly moves: readonly PieceDisplacement[];
}

export interface ChainOptions {
  readonly steps: number;
  /** Next space toward the push or pull. Undefined means the line ends. */
  readonly next: (space: string) => string | undefined;
  readonly blocked?: (piece: string, from: string, to: string) => boolean;
  readonly canPush?: (moving: string, occupant: string) => boolean;
  readonly stop?: (space: string) => boolean;
}

/** Plan a displacement over a one-piece-per-space snapshot. Apply all returned moves together. */
export function displaceChain(board: Board, from: string, occupants: ReadonlyMap<string, string>, options: ChainOptions): ChainDisplacement {
  checkedPoints(options.steps);
  if (!has(board, from) || !occupants.has(from)) throw new Error('displacement origin needs a piece: ' + from);
  const occupancy = new Map(occupants);
  const pieces = new Set<string>();
  for (const [space, piece] of occupancy) {
    if (!has(board, space) || !piece || pieces.has(piece)) throw new Error('invalid displacement occupancy at ' + space);
    pieces.add(piece);
  }
  const moves = new Map<string, PieceDisplacement>();
  const visited = new Set([from]);
  let at = from;
  let moved = 0;
  const finish = (stop: ChainDisplacement['stop']): ChainDisplacement => {
    if (stop === 'blocked' || stop === 'endOfLine') return { stop, destination: from, moved: 0, remaining: options.steps, moves: [] };
    return { stop, destination: at, moved, remaining: options.steps - moved, moves: [...moves.values()] };
  };
  while (moved < options.steps) {
    const destination = options.next(at);
    if (destination === undefined) return finish('endOfLine');
    if (visited.has(destination)) return finish('blocked');
    const links: PieceDisplacement[] = [];
    const chain = new Set([at]);
    let current = at;
    let to: string | undefined = destination;
    let piece = occupancy.get(current);
    while (piece !== undefined) {
      if (to === undefined || !has(board, to) || !(board.adjacency[current] ?? []).includes(to) ||
          chain.has(to) || options.blocked?.(piece, current, to)) return finish('blocked');
      links.push({ piece, from: current, to });
      const occupant = occupancy.get(to);
      if (occupant === undefined) break;
      if (!options.canPush?.(piece, occupant)) return finish('blocked');
      chain.add(to);
      current = to;
      piece = occupant;
      to = options.next(current);
    }
    for (const move of links.reverse()) {
      occupancy.delete(move.from);
      occupancy.set(move.to, move.piece);
      moves.set(move.piece, { ...move, from: moves.get(move.piece)?.from ?? move.from });
    }
    at = destination;
    visited.add(at);
    moved++;
    if (moved < options.steps && options.stop?.(at)) return finish('interrupted');
  }
  return finish('complete');
}
