// docs/decisions/SM-explicit-state-machines.md item 1: the typed machine helper of src/lib/machine.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  allowedFrom,
  can,
  defineMachine,
  edgesOf,
  getMachine,
  hasEdge,
  IllegalTransitionError,
  isState,
  listMachines,
  MACHINES_DOC,
  setMachineMode,
  transition,
  declareLocalState,
  expectEdge,
  listLocalState,
  transitionTo,
} from './machine';

type Door = 'closed' | 'open' | 'locked';
type DoorEvent = 'open' | 'close' | 'lock' | 'unlock';

const DOOR = defineMachine<Door, DoorEvent>({
  id: 'test.door',
  initial: 'closed',
  states: {
    closed: { on: { open: 'open', lock: 'locked' } },
    open: { on: { close: 'closed' } },
    locked: { on: { unlock: 'closed' } },
  },
  describe: { purpose: 'A test door.', source: 'components/state-machines/machine.test.ts' },
});

afterEach(() => {
  setMachineMode('auto');
});

describe('machine helper (src/lib/machine.ts)', () => {
  it('transition returns the target of a legal event; can, allowedFrom, hasEdge and edgesOf read the table', () => {
    expect(transition(DOOR, 'closed', 'open')).toBe('open');
    expect(transition(DOOR, 'open', 'close')).toBe('closed');
    expect(can(DOOR, 'closed', 'lock')).toBe(true);
    expect(can(DOOR, 'open', 'lock')).toBe(false);
    expect(allowedFrom(DOOR, 'closed')).toEqual([
      { event: 'open', to: 'open' },
      { event: 'lock', to: 'locked' },
    ]);
    expect(hasEdge(DOOR, 'locked', 'closed')).toBe(true);
    expect(hasEdge(DOOR, 'locked', 'open')).toBe(false);
    expect(isState(DOOR, 'open')).toBe(true);
    expect(isState(DOOR, 'ajar')).toBe(false);
    expect(edgesOf(DOOR)).toHaveLength(4);
    expect(DOOR.stateNames).toEqual(['closed', 'open', 'locked']);
    expect(DOOR.eventNames).toEqual(['open', 'lock', 'close', 'unlock']);
  });

  it('an illegal event throws under test, with the machine, state, event, allowed events and where the table lives', () => {
    let error: unknown;
    try {
      transition(DOOR, 'open', 'lock');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(IllegalTransitionError);
    const e = error as IllegalTransitionError;
    expect([e.machine, e.state, e.event, e.allowed]).toEqual(['test.door', 'open', 'lock', ['close']]);
    expect(e.message).toContain('[machine test.door] illegal event "lock" in state "open"');
    expect(e.message).toContain('Allowed from "open": close -> closed.');
    expect(e.message).toMatch(/Table: components\/state-machines\/machine\.test\.ts:\d+ \(search: id: 'test\.door'\)/);
    expect(DOOR.line).toBeGreaterThan(0);
    expect(e.message).toContain(`${MACHINES_DOC}#testdoor`);
    expect(e.message).toContain('npm run machines -- test.door');
  });

  it('in production mode an illegal event logs the same message and stays in the state', () => {
    setMachineMode('log');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(transition(DOOR, 'locked', 'open')).toBe('locked');
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]?.[0])).toContain('Allowed from "locked": unlock -> closed.');
    } finally {
      log.mockRestore();
    }
  });

  it('a terminal state says so', () => {
    const END = defineMachine<'run' | 'done', 'finish'>({
      id: 'test.end',
      initial: 'run',
      states: { run: { on: { finish: 'done' } }, done: { on: {} } },
      describe: { purpose: 'A test end.', source: 'components/state-machines/machine.test.ts' },
    });
    expect(() => transition(END, 'done', 'finish')).toThrow('Allowed from "done": none: "done" is terminal.');
  });

  it('the registry lists machines by id and refuses duplicates, unknown targets and an unknown initial state', () => {
    expect(getMachine('test.door')).toBe(DOOR);
    expect(listMachines().map((m) => m.id)).toContain('test.door');
    const again = (): unknown =>
      defineMachine<Door, DoorEvent>({ ...DOOR, describe: { purpose: 'x', source: 'x' } });
    expect(again).toThrow('duplicate machine id "test.door"');
    expect(() =>
      defineMachine<string, string>({
        id: 'test.bad-target',
        initial: 'a',
        states: { a: { on: { go: 'nowhere' } } },
        describe: { purpose: 'x', source: 'x' },
      }),
    ).toThrow('"a" --go--> "nowhere": the target is not a state');
    expect(() =>
      defineMachine<string, string>({
        id: 'test.bad-initial',
        initial: 'z',
        states: { a: { on: {} } },
        describe: { purpose: 'x', source: 'x' },
      }),
    ).toThrow('initial state "z" is not in the table');
  });

  it('transitionTo returns the target when the data agrees, and throws a mismatch naming both when it does not', () => {
    expect(transitionTo(DOOR, 'closed', 'open', 'open')).toBe('open');
    expect(() => transitionTo(DOOR, 'closed', 'open', 'locked')).toThrow(
      'event "open" from "closed" leads to "open" in the table, but the data is in "locked"',
    );
    expect(() => transitionTo(DOOR, 'open', 'lock', 'locked')).toThrow(IllegalTransitionError);
  });

  it('expectEdge accepts staying and an edge, and throws on a move with no edge, with the allowed list', () => {
    expect(() => {
      expectEdge(DOOR, 'open', 'open', 'test');
      expectEdge(DOOR, 'locked', 'closed', 'test');
    }).not.toThrow();
    expect(() => {
      expectEdge(DOOR, 'locked', 'open', 'the door moved');
    }).toThrow('[machine test.door] the door moved: "locked" -> "open" is not an edge of the table.');
    setMachineMode('log');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expectEdge(DOOR, 'locked', 'open', 'the door moved');
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it('declareLocalState lists plain state for the map and refuses duplicates', () => {
    declareLocalState([{ id: 'test.local', source: 'components/state-machines/machine.test.ts', why: 'A test value.' }]);
    expect(listLocalState().map((l) => l.id)).toContain('test.local');
    expect(() => {
      declareLocalState([{ id: 'test.local', source: 'x', why: 'x' }]);
    }).toThrow('duplicate id "test.local"');
  });
});

describe('index', () => {
  it('exports the machine helpers', async () => {
    const m = await import('./index');
    expect(m.defineMachine).toBe(defineMachine);
    expect(m.transition).toBe(transition);
  });
});
