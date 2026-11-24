import { describe,expect,it } from 'vitest';
import { createBoard } from './index.ts';
import { reachableMoves,displaceAlong } from './movement.ts';

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
  it('rejects invalid points, missing origins and nonpositive costs',()=>{
    expect(()=>reachableMoves(board,'x',{points:1,cost:()=>1})).toThrow('origin');
    expect(()=>reachableMoves(board,'a',{points:-1,cost:()=>1})).toThrow('points');
    expect(()=>reachableMoves(board,'a',{points:1,cost:()=>0})).toThrow('step cost');
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
