import { describe,expect,it } from 'vitest';
import { createBoard } from './index.ts';
import { reachableMoves,displaceAlong,displaceChain } from './movement.ts';

const board=createBoard(['a','b','c','d','e'].map(id=>({id})),[['a','b'],['a','c'],['b','d'],['c','d'],['d','e']]);
describe('K602 board movement',()=>{
  it('finds the cheapest legal path with asymmetric movement costs',()=>{
    const cost=(from:string,to:string)=>from==='a'&&to==='b'?3:1;
    expect(reachableMoves(board,'a',{points:2,cost})).toEqual([
      {space:'c',cost:1,path:['a','c']},{space:'d',cost:2,path:['a','c','d']},
    ]);
  });
  it('distinguishes blocking, passing through, and mandatory stopping',()=>{
    const result=reachableMoves(board,'a',{points:4,cost:(_from,to)=>to==='b'?null:1,end:to=>to!=='c',stop:to=>to==='d'});
    expect(result).toEqual([{space:'d',cost:2,path:['a','c','d']}]);
  });
  it('uses deterministic tie-breaking and never mutates the board',()=>{
    const before=JSON.stringify(board);
    const result=reachableMoves(board,'a',{points:3,cost:()=>1});
    expect(result.find(x=>x.space==='d')?.path).toEqual(['a','b','d']);
    expect(reachableMoves(board,'a',{points:0,cost:()=>1})).toEqual([]);
    expect(JSON.stringify(board)).toBe(before);
  });
  it('rejects invalid points, missing origins and negative costs',()=>{
    expect(()=>reachableMoves(board,'x',{points:1,cost:()=>1})).toThrow('origin');
    expect(()=>reachableMoves(board,'a',{points:-1,cost:()=>1})).toThrow('points');
    expect(()=>reachableMoves(board,'a',{points:1,cost:()=>-1})).toThrow('step cost');
  });
  it('returns completed, blocked, interrupted and short displacement outcomes',()=>{
    expect(displaceAlong(board,'a',['b','d'],{steps:2})).toMatchObject({destination:'d',moved:2,remaining:0,stop:'complete'});
    expect(displaceAlong(board,'a',['b','d'],{steps:2,blocked:(_from,to)=>to==='d'})).toMatchObject({destination:'b',moved:1,remaining:1,stop:'blocked'});
    expect(displaceAlong(board,'a',['b','d'],{steps:2,stop:to=>to==='b'})).toMatchObject({destination:'b',moved:1,stop:'interrupted'});
    expect(displaceAlong(board,'a',['b'],{steps:2})).toMatchObject({destination:'b',remaining:1,stop:'endOfLine'});
    expect(displaceAlong(board,'a',['e'],{steps:1})).toMatchObject({destination:'a',stop:'blocked'});
    expect(()=>displaceAlong(board,'a',['b','a'],{steps:2})).toThrow('repeats');
  });
});

it('finds zero-cost paths on a directed graph without following cycles forever', () => {
  const directed = { ...board, adjacency: { a: ['c','b'], b: ['d'], c: ['d'], d: ['a'], e: [] } };
  expect(reachableMoves(directed, 'a', { points: 0, cost: () => 0 })).toEqual([
    { space: 'b', cost: 0, path: ['a','b'] },
    { space: 'c', cost: 0, path: ['a','c'] },
    { space: 'd', cost: 0, path: ['a','b','d'] },
  ]);
  expect(reachableMoves(directed, 'e', { points: 5, cost: () => 0 })).toEqual([]);
});

const corridor = createBoard(['a','b','c','d','e'].map(id => ({ id })), [['a','b'],['b','c'],['c','d'],['d','e']]);
const occupancy = new Map([['a','first'],['b','second'],['c','third']]);
const next = (space: string) => ({ a:'b', b:'c', c:'d', d:'e' } as Record<string, string>)[space];

it('plans an atomic forced chain and preserves the input', () => {
  const result = displaceChain(corridor, 'a', occupancy, { steps: 2, next, canPush: () => true });
  expect(result).toEqual({
    stop: 'complete', destination: 'c', moved: 2, remaining: 0, moves: [
      { piece: 'third', from: 'c', to: 'e' },
      { piece: 'second', from: 'b', to: 'd' },
      { piece: 'first', from: 'a', to: 'c' },
    ],
  });
  expect([...occupancy]).toEqual([['a','first'],['b','second'],['c','third']]);
});

it('discards a blocked plan and reports a completed prefix at an explicit interruption', () => {
  expect(displaceChain(corridor, 'a', occupancy, { steps: 2, next })).toMatchObject({ stop: 'blocked', moved: 0, remaining: 2, moves: [] });
  expect(displaceChain(corridor, 'a', occupancy, {
    steps: 2, next, canPush: () => true, blocked: (_piece, _from, to) => to === 'e',
  })).toMatchObject({ stop: 'blocked', destination: 'a', moved: 0, remaining: 2, moves: [] });
  expect(displaceChain(corridor, 'a', occupancy, {
    steps: 2, next, canPush: () => true, stop: to => to === 'b',
  })).toMatchObject({ stop: 'interrupted', destination: 'b', moved: 1, remaining: 1, moves: [
    { piece: 'third', from: 'c', to: 'd' },
    { piece: 'second', from: 'b', to: 'c' },
    { piece: 'first', from: 'a', to: 'b' },
  ] });
});

it('discards a chain ending at a wall or a cycle', () => {
  expect(displaceChain(corridor, 'a', occupancy, {
    steps: 4, next, canPush: () => true,
  })).toMatchObject({ stop: 'blocked', destination: 'a', moved: 0, remaining: 4, moves: [] });
  const fullCycle = new Map([['a', 'first'], ['b', 'second']]);
  expect(displaceChain(corridor, 'a', fullCycle, {
    steps: 1, next: space => space === 'a' ? 'b' : 'a', canPush: () => true,
  })).toMatchObject({ stop: 'blocked', moves: [] });
  expect(displaceChain(corridor, 'a', new Map([['a', 'first']]), {
    steps: 2, next: space => space === 'a' ? 'b' : undefined,
  })).toMatchObject({ stop: 'endOfLine', destination: 'a', moved: 0, remaining: 2, moves: [] });
});

it('matches an exhaustive simple-path oracle for 6,000 directed graph queries', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const spaces = Object.fromEntries(ids.map(id => [id, { id }]));
  let rng = 0x7a309581;
  const sample = (limit: number): number => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return Math.floor(rng / 0x100000000 * limit);
  };
  for (let g = 0; g < 1000; g++) {
    const costs = new Map<string, number | null>();
    const adjacency = Object.fromEntries(ids.map(from => [from, ids.filter(to => {
      if (from === to || sample(3) === 0) return false;
      const value = sample(6);
      costs.set(from + to, value === 5 ? null : value);
      return true;
    })]));
    const cost = (from: string, to: string) => costs.get(from + to) ?? null;
    const stop = new Set(ids.filter(() => sample(4) === 0));
    const excluded = new Set(ids.filter(() => sample(4) === 0));
    for (const from of ids) {
      const points = sample(9);
      const cheapest = new Map<string, number>();
      const walk = (at: string, distance: number, path: readonly string[]): void => {
        if (at !== from && !excluded.has(at)) cheapest.set(at, Math.min(distance, cheapest.get(at) ?? Infinity));
        if (at !== from && stop.has(at)) return;
        for (const to of adjacency[at] ?? []) {
          const price = cost(at, to);
          if (!path.includes(to) && price !== null && distance + price <= points) walk(to, distance + price, [...path, to]);
        }
      };
      walk(from, 0, [from]);
      const moves = reachableMoves({ spaces, order: ids, adjacency }, from, {
        points, cost, stop: id => stop.has(id), end: id => !excluded.has(id),
      });
      expect(moves.map(move => [move.space, move.cost]), 'graph ' + String(g) + ' from ' + from).toEqual(
        ids.filter(id => cheapest.has(id)).map(id => [id, cheapest.get(id)]),
      );
      for (const move of moves) {
        let valid = move.path[0] === from && move.path.at(-1) === move.space && new Set(move.path).size === move.path.length;
        let distance = 0;
        for (const [i, at] of move.path.slice(0, -1).entries()) {
          const to = move.path[i + 1] as string;
          const price = cost(at, to);
          valid &&= (i === 0 || !stop.has(at)) && (adjacency[at]?.includes(to) ?? false) && price !== null;
          distance += price ?? Infinity;
        }
        expect(valid && distance === move.cost, 'invalid path: ' + move.path.join(' ')).toBe(true);
      }
    }
  }
}, 30000);
