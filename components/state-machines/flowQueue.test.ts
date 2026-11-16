import { describe, expect, it } from 'vitest';
import { FlowQueue } from './flowQueue';

describe('FlowQueue', () => {
  const same = (a: number, b: number) => a === b;
  it('drops a request whose turn has moved on', () => {
    const q = new FlowQueue<number>();
    let turn = 1;
    const ran: string[] = [];
    q.request('endTurn', 1);
    q.request('endTurn', 1);
    const dropped = q.flush(() => turn, same, (r) => {
      ran.push(r.name);
      turn++;
    });
    expect(ran).toEqual(['endTurn']);
    expect(dropped).toHaveLength(1);
  });
  it('stops a runaway loop and names the call site', () => {
    const q = new FlowQueue<number>(5);
    q.request('endTurn', 0, 'moves.ts:9');
    expect(() => q.flush(() => 0, same, (r) => q.request(r.name, 0, r.site))).toThrow(/"endTurn" ran more than 5 times.*moves\.ts:9/);
    expect(q.size).toBe(0);
  });
});

