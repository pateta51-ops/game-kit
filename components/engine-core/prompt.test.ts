// K222: the prompt contract. The answer resumes the task bound to the prompt (by id), never whatever is on top; a prompt
// nobody can answer is refused; `kind` and `seat` are optional prompt fields.
import { describe, expect, it } from 'vitest';
import { applyAction, applyActionWith, createGame, draftOf, EngineBugError, makeCtx, run, seatKey, would, type AnswerAction, type Ctx, type DebugAction, type Draft, type GameRules, type HandlerTable, type KernelPrompt } from './index';
import { answer as pickIn, HIT, SHIELD, startTimed, timedGame, type Timed } from './fake/timed';
import { promptOf } from './timing';
import { bareState, CONTENT, COUNTER, RULES, type Counter, type CounterState, type CounterTask } from './fake/counter';

const P: Omit<KernelPrompt, 'id'> = { options: [{ id: 'x', enabled: true }], min: 1, max: 1 };

function start(table: HandlerTable<Counter>, ...first: CounterTask[]): Draft<CounterState> {
  const s = bareState();
  const ctx = makeCtx<Counter>(COUNTER, s, CONTENT, []);
  ctx.then(...first);
  run(ctx, table);
  return s;
}

const answer = (table: HandlerTable<Counter>, s: Draft<CounterState>) =>
  applyActionWith(COUNTER, s as CounterState, { kind: 'answer', promptId: s.prompt?.id ?? 0, picks: ['x'] }, CONTENT, table);

describe('K222 prompt contract', () => {
  it('A1: ask(prompt, resume) pushes the resume task and the answer reaches it, not the task below', () => {
    const got: (readonly string[] | undefined)[] = [];
    const table: HandlerTable<Counter> = {
      asks: (ctx) => ctx.ask(P, { kind: 'resume' }),
      resume: (_ctx, t) => void got.push(t.answer),
      other: () => {
        throw new Error('the unrelated task got the answer');
      },
    };
    const s = start(table, { kind: 'asks' }, { kind: 'other' });
    expect(s.stack.at(-1)).toEqual({ kind: 'resume', prompt: s.prompt?.id });
    const r = answer({ ...table, other: () => undefined }, s);
    expect(got).toEqual([['x']]);
    expect(r.state.stack).toEqual([]);
  });

  it('A1: a handler that asks without a resume task is an engine bug at once (no unrelated task gets the answer)', () => {
    const table: HandlerTable<Counter> = { asks: (ctx) => ctx.ask(P), other: () => undefined };
    expect(() => start(table, { kind: 'asks' }, { kind: 'other' })).toThrow(EngineBugError);
    expect(() => start(table, { kind: 'asks' })).toThrow(EngineBugError);
  });

  it('A1: then after ask is an engine bug', () => {
    const table: HandlerTable<Counter> = {
      asks: (ctx) => {
        ctx.then({ kind: 'resume' });
        ctx.ask(P);
        ctx.then({ kind: 'late' });
      },
    };
    expect(() => start(table, { kind: 'asks' })).toThrow(EngineBugError);
  });

  it('A1: an answer whose bound task is not on top is refused', () => {
    const table: HandlerTable<Counter> = { asks: (ctx) => ctx.ask(P, { kind: 'resume' }), resume: () => undefined, late: () => undefined };
    const s = start(table, { kind: 'asks' });
    s.stack = [...s.stack, { kind: 'late' }];
    expect(() => answer(table, s)).toThrow(EngineBugError);
  });

  it('a state saved before K222 (untagged resume task) still answers', () => {
    const got: string[] = [];
    const table: HandlerTable<Counter> = { resume: (_c, t) => void got.push(...(t.answer ?? [])) };
    const s = bareState();
    s.stack = [{ kind: 'resume' }];
    s.prompt = { id: 1, ...P } as Draft<CounterState>['prompt'];
    answer(table, s);
    expect(got).toEqual(['x']);
  });

  it('A7: a prompt with fewer enabled options than min is refused', () => {
    const table: HandlerTable<Counter> = {
      dead: (ctx) => ctx.ask({ options: [{ id: 'x', enabled: false, why: 'no' }], min: 1, max: 1 }, { kind: 'r' }),
      inverted: (ctx) => ctx.ask({ options: [{ id: 'x', enabled: true }], min: 1, max: 0 }, { kind: 'r' }),
      zero: (ctx) => ctx.ask({ options: [{ id: 'x', enabled: false }], min: 0, max: 1 }, { kind: 'r' }),
      r: () => undefined,
    };
    expect(() => start(table, { kind: 'dead' })).toThrow(EngineBugError);
    expect(() => start(table, { kind: 'inverted' })).toThrow(EngineBugError);
    expect(start(table, { kind: 'zero' }).prompt?.min).toBe(0);
  });

  it('A2: kind and seat are optional prompt fields', () => {
    const table: HandlerTable<Counter> = { asks: (ctx) => ctx.ask({ ...P, kind: 'pick', seat: 'b' }, { kind: 'r' }), r: () => undefined };
    const p = start(table, { kind: 'asks' }).prompt;
    expect([p?.kind, p?.seat]).toEqual(['pick', 'b']);
  });

  it('A2: the default timing prompt carries kind and the chooser as seat', () => {
    const base = { options: [{ id: 'x', enabled: true }], min: 1, max: 1 };
    const occurrence = { id: 1 } as Parameters<typeof promptOf>[2]['occurrence'];
    expect(promptOf<Counter>({ happen: () => undefined }, base, { why: 'prevent', player: 'p2', occurrence })).toEqual({ ...base, kind: 'timing.prevent', seat: 'p2' });
  });

  it('A1: a nested prompt: the answered task asks again with a bound resume, and each answer reaches its own task', () => {
    const got: string[] = [];
    const table: HandlerTable<Counter> = {
      first: (ctx) => ctx.ask(P, { kind: 'second' }),
      second: (ctx, t) => {
        got.push(`second:${String(t.answer)}`);
        ctx.ask({ ...P, options: [{ id: 'y', enabled: true }] }, { kind: 'third' });
      },
      third: (_c, t) => void got.push(`third:${String(t.answer)}`),
      below: () => void got.push('below'),
    };
    const s1 = start(table, { kind: 'first' }, { kind: 'below' });
    const s2 = answer(table, s1).state;
    expect(s2.prompt?.id).toBe(2);
    expect(s2.stack).toEqual([{ kind: 'below' }, { kind: 'third', prompt: 2 }]);
    applyActionWith(COUNTER, s2, { kind: 'answer', promptId: 2, picks: ['y'] }, CONTENT, table);
    expect(got).toEqual(['second:x', 'third:y', 'below']);
  });

  it('A1: a stale prompt tag on the stack (a copied bound task) does not block an answer', () => {
    const got: string[] = [];
    const table: HandlerTable<Counter> = { resume: (_c, t) => void got.push(String(t.answer)), old: () => undefined };
    const below = bareState();
    below.stack = [{ kind: 'old', prompt: 1 }, { kind: 'resume' }] as Draft<CounterState>['stack'];
    below.prompt = { id: 5, ...P } as Draft<CounterState>['prompt'];
    expect(answer(table, below).state.stack).toEqual([]);
    const top = bareState();
    top.stack = [{ kind: 'resume', prompt: 1 }] as unknown as Draft<CounterState>['stack'];
    top.prompt = { id: 5, ...P } as Draft<CounterState>['prompt'];
    expect(answer(table, top).state.stack).toEqual([]);
    expect(got).toEqual(['x', 'x']);
  });

  it('A1: then while a prompt is open stays allowed in a debug edit, which refuses it in its own words', () => {
    type Dbg = Omit<Counter, 'action'> & { readonly action: AnswerAction | DebugAction };
    const G: GameRules<Dbg> = { ...(COUNTER as unknown as GameRules<Dbg>), debug: { loop: (ctx) => (ctx.then({ kind: 'turn' }), undefined) } };
    const s = createGame(G, { seed: 'k222' }, RULES, CONTENT).state;
    expect(() => applyAction(G, s, { kind: 'debug', verb: 'loop' }, CONTENT)).toThrow(/cannot schedule tasks/);
  });

  it('A7: the refusal names the prompt and says why', () => {
    const table: HandlerTable<Counter> = { dead: (ctx) => ctx.ask({ options: [{ id: 'x', enabled: false, why: 'no cards' }, { id: 'y', enabled: true }], min: 2, max: 2, kind: 'discard', seat: 'p1' }, { kind: 'r' }) };
    expect(() => start(table, { kind: 'dead' })).toThrow('ask: prompt 1 (kind "discard", seat p1, resuming "r") cannot be answered: it needs at least 2 pick(s) but only 1 of 2 option(s) are enabled; disabled: x (no cards).');
  });

  it('A2: seatKey makes 0 and "0" one seat', () => {
    expect([seatKey(0), seatKey('0'), seatKey(undefined)]).toEqual(['0', '0', undefined]);
  });
});

describe('K222 timing through bound and old-form resumes', () => {
  // the game's own turn prompt asks in either form; the kit's prevent window and trigger order prompts follow
  const play = (bound: boolean) => {
    const cands = [{ ability: 'x', source: 'c1', player: 'p2', order: 'interactive' as const }, { ability: 'y', source: 'c2', player: 'p2' }];
    const g = timedGame({
      preventions: () => [{ id: 'shield', prevention: SHIELD }],
      triggersFor: () => cands,
      resolveTrigger: (ctx, p) => {
        const s = draftOf(ctx);
        s.used = { ...s.used, [p.ability]: Object.keys(s.used).length };
      },
      orderPrompt: (base, info) => ({ ...base, player: info.player }),
    }, {
      turn: (ctx: Ctx<Timed>) => {
        const p = { min: 1, max: 1, options: [{ id: 'hit', enabled: true }], player: 'p1' };
        if (bound) ctx.ask(p, { kind: 'chosen' });
        else {
          ctx.then({ kind: 'chosen' });
          ctx.ask(p);
        }
      },
      chosen: (ctx: Ctx<Timed>) => {
        ctx.then({ kind: 'timing.triggers' }, { kind: 'end' });
        would(ctx, [HIT]);
      },
    });
    let s = startTimed(g);
    const asked: string[] = [];
    for (const pick of ['hit', 'shield', 'pass', '4']) {
      asked.push(s.prompt?.options.map((o) => o.id).join() ?? '');
      s = applyAction(g, s, pickIn(s, pick), null).state;
    }
    return { asked, hp: s.hp, used: s.used, result: s.result };
  };
  it('the same prompts and the same end either way', () => {
    const b = play(true);
    expect(b).toEqual(play(false));
    expect(b.asked).toEqual(['hit', 'shield,pass', 'shield,pass', '3,4']);
    expect(b).toMatchObject({ hp: 9, used: { y: 0, x: 1 }, result: { hp: 9 } });
  });
});
