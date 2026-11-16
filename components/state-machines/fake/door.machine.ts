import { defineMachine } from '../machine.ts';

export type DoorState = 'closed' | 'open' | 'locked';
export type DoorEvent = 'open' | 'close' | 'lock' | 'unlock';

export const DOOR_MACHINE = defineMachine<DoorState, DoorEvent>({
  id: 'fake.door',
  initial: 'closed',
  states: {
    closed: { on: { open: 'open', lock: 'locked' } },
    open: { on: { close: 'closed' } },
    locked: { on: { unlock: 'closed' } },
  },
  describe: {
    purpose: 'A door, for the kit tests.',
    source: 'components/state-machines/fake/door.machine.ts',
  },
});
