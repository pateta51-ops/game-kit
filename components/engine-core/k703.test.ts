// K703: a state check with `afterBatch: true` waits until no occurrence is pending, so it sees the whole batch settled.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, draftOf, hashState, would, type Ctx, type OccurrenceInput, type StateCheck, type TimingConfig } from './index.ts';
import { answer, timedGame, type Timed, type TimedState } from './fake/timed.ts';

// Pieces on the map are the keys of `used` ("a:x" is side a's piece x); a hit removes its target.
const SIDES = ['a', 'b'];
const left = (s: TimedState, side: string): number => Object.keys(s.used).filter((k) => k.startsWith(`${side}:`)).length;
const fires: string[] = [];
const removed: string[] = [];
const over = (ctx: Ctx<Timed>, who: string): void => {
  fires.push(`${who} after ${String(removed.length)}`);
  draftOf(ctx).result = { hp: removed.length };
};
// recipe:start
const noneLeft: StateCheck<Timed> = {
  name: 'none left',
  afterBatch: true, // waits until every occurrence of the batch has happened
  run: (ctx) => {
    if (ctx.s.result !== null) return false;
    const out = SIDES.filter((side) => left(ctx.s, side) === 0);
    if (out.length === 0) return false;
    over(ctx, out.length === SIDES.length ? 'draw' : `${out.join()} loses`);
    return true;
  },
};
// recipe:end

const rm = (target: string): OccurrenceInput => ({ kind: 'remove', keys: { player: 'p2', target }, amount: 1 });
const setup = (checks: readonly StateCheck<Timed>[], cfg: Partial<TimingConfig<Timed>> = {}, nest = false) => {
  fires.length = 0;
  removed.length = 0;
  const g = timedGame({
    happen: (ctx, o) => {
      const s = draftOf(ctx);
      const { [o.keys.target ?? '']: _gone, ...rest } = s.used;
      s.used = rest;
      removed.push(o.keys.target ?? '');
      if (nest && o.keys.target === 'a:1') would(ctx, [rm('b:2')]);
    },
    checkpoint: { checks },
    ...cfg,
  }, {
    chosen: (ctx) => {
      draftOf(ctx).used = { 'a:1': 1, 'b:1': 1, 'b:2': 1 };
      would(ctx, (nest ? ['a:1', 'b:1'] : ['a:1', 'b:1', 'b:2']).map(rm));
    },
  });
  const s0 = createGame(g, { seed: 'k703' }, { items: [] }, null).state;
  return { g, s: applyAction(g, s0, answer(s0, 'hit'), null).state };
};
const play = (...a: Parameters<typeof setup>): TimedState => setup(...a).s;
const SHIELD_B2: Partial<TimingConfig<Timed>> = { preventions: (_s, o) => (o.keys.target === 'b:2' ? [{ id: 'shield', prevention: { prevents: 'remove' } }] : []) };
const mark: StateCheck<Timed> = {
  name: 'mark',
  run: (ctx) => {
    if (ctx.s.hp === removed.length) return false;
    draftOf(ctx).hp = removed.length;
    fires.push(`mark ${String(removed.length)}`);
    return true;
  },
};
const seen: StateCheck<Timed> = {
  name: 'seen',
  afterBatch: true,
  run: () => {
    const f = `check after ${String(removed.length)}`;
    if (!fires.includes(f)) fires.push(f);
    return false;
  },
};

describe('state checks after the whole batch (K703)', () => {
  it('K703 three pieces removed in one batch: the afterBatch check "none left" fires once, after the third (a draw)', () => {
    const s = play([noneLeft]);
    expect(fires).toEqual(['draw after 3']);
    expect(removed).toEqual(['a:1', 'b:1', 'b:2']);
    expect(s.result).toEqual({ hp: 3 });
  });

  it('K703 default unchanged: without afterBatch the check runs between occurrences and fires after the first; hash recorded from the code before K703', () => {
    const { afterBatch: _a, ...today } = noneLeft;
    const s = play([today]);
    expect(fires).toEqual(['a loses after 1']);
    expect(s.result).toEqual({ hp: 1 });
    expect(hashState(s)).toBe('62e7be012b381106');
    expect(hashState(play([{ ...today, afterBatch: false }]))).toBe('62e7be012b381106');
  });

  it('K703 a would nested in happen: the afterBatch check waits for the outer batch too (draw after 3, not "a loses" after the nested one)', () => {
    const s = play([noneLeft], {}, true);
    expect(removed).toEqual(['a:1', 'b:2', 'b:1']);
    expect(fires).toEqual(['draw after 3']);
    expect(s.result).toEqual({ hp: 3 });
  });

  it('K703 a prevention prompt mid-batch, the state saved and loaded as JSON before the answer: the check fires once, after the batch', () => {
    const { g, s } = setup([noneLeft], SHIELD_B2);
    expect(s.prompt?.options.map((o) => o.id)).toEqual(['shield', 'pass']);
    expect(removed).toEqual(['a:1', 'b:1']);
    expect(fires).toEqual([]);
    const loaded = JSON.parse(JSON.stringify(s)) as TimedState;
    const end = applyAction(g, loaded, answer(loaded, 'pass'), null).state;
    expect(fires).toEqual(['draw after 3']);
    expect(end.result).toEqual({ hp: 3 });
  });

  it('K703 the last occurrence of the batch is cancelled (all prevented): the check still fires once, after it', () => {
    const { g, s } = setup([noneLeft], SHIELD_B2);
    const end = applyAction(g, s, answer(s, 'shield'), null).state;
    expect(removed).toEqual(['a:1', 'b:1']);
    expect(fires).toEqual(['a loses after 2']);
    expect(end.result).toEqual({ hp: 2 });
  });

  it('K703 an afterBatch check beside a normal check that changes state: rulebook order is kept, pinned both ways', () => {
    play([mark, noneLeft]);
    expect(fires).toEqual(['mark 1', 'mark 2', 'mark 3', 'draw after 3']);
    play([noneLeft, mark]);
    expect(fires).toEqual(['mark 1', 'mark 2', 'draw after 3']);
  });

  it('K703 state checks before triggers: the afterBatch check runs when the outermost batch has settled, before a trigger answering the batch resolves', () => {
    play([seen], {
      triggersFor: () => [{ ability: 't', source: 'c', player: 'p2', once: 'perInstance' }],
      resolveTrigger: () => void fires.push('trigger'),
    });
    expect(fires).toEqual(['check after 3', 'trigger']);
  });

  it('K703 the timing.md recipe is the check this file runs, line for line', () => {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').replaceAll('\r', '');
    const block = /\/\/ recipe:start\n([\s\S]*?)\n\/\/ recipe:end/.exec(src)?.[1]?.split('\n').map((l) => l.trim());
    const doc = readFileSync(new URL('timing.md', import.meta.url), 'utf8').replaceAll('\r', '');
    const at = /\*\*Recipe: state checks after the whole batch[^\n]*\n\s*```ts\n([\s\S]*?)```/.exec(doc)?.[1]?.trim().split('\n').map((l) => l.trim());
    expect(block).toHaveLength(11);
    expect(at).toEqual(block);
  });
});
