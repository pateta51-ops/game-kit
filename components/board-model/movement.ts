import type { Board } from './index.ts';

/** null blocks a step; a positive integer is its movement-point cost. */
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
  if (cost !== null && (!Number.isSafeInteger(cost) || cost < 1)) throw new Error('movement step cost must be a positive safe integer or null');
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
  const settled = new Set<string>();
  while (true) {
    const next = [...best.values()].filter(d => !settled.has(d.space)).sort((a,b)=>a.cost-b.cost || (order.get(a.space) ?? 0)-(order.get(b.space) ?? 0))[0];
    if (!next) break;
    settled.add(next.space);
    if (next.space !== from && options.stop?.(next.space)) continue;
    for (const to of board.adjacency[next.space] ?? []) {
      if (!has(board,to)) throw new Error('unknown adjacent space ' + to);
      if (settled.has(to)) continue;
      const cost = checkedCost(options.cost(next.space,to));
      if (cost === null || cost > options.points-next.cost) continue;
      const total = next.cost+cost;
      if ((best.get(to)?.cost ?? Infinity) <= total) continue;
      best.set(to,{space:to,cost:total,path:[...next.path,to]});
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
