import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SetupForm } from '../screens/ui.ts';
import { defaultSetup } from '../screens/index.ts';
import { cheatActions, cheatedOf, cheatFields, cheatProblem, cheatsFrom, type CheatDef } from './index.ts';

const defs: CheatDef[] = [
  { id: 'commandos', label: 'Extra starting units', kind: 'number', when: 'setup', edits: [{ path: ['units'] }, { path: ['units'], by: 2 }], max: 3 },
  { id: 'fury', label: 'Full fury', kind: 'toggle', when: 'setup', edits: [{ path: ['fury'], op: 'set', by: 6 }] },
  { id: 'extraActions', label: 'Extra actions', kind: 'number', when: 'round', edits: [{ path: ['res', '0', 'actions'], max: 9 }] },
];
const state = { units: 3, fury: 1, res: { '0': { actions: 3 } } };

describe('K738 cheat options', () => {
  it('K738: turns the chosen cheats due at set-up or at a round into kernel set edits (edits on one path add up)', () => {
    const c = { allowCheats: true, cheats: { commandos: 1, fury: true, extraActions: 2 } };
    expect(cheatActions(defs, c, state, 'setup')).toEqual([
      { kind: 'debug', verb: 'set', args: { path: ['units'], value: 4, cheat: 'commandos' } },
      { kind: 'debug', verb: 'set', args: { path: ['units'], value: 6, cheat: 'commandos' } },
      { kind: 'debug', verb: 'set', args: { path: ['fury'], value: 6, cheat: 'fury' } },
    ]);
    expect(cheatActions(defs, c, state, 'round')).toEqual([{ kind: 'debug', verb: 'set', args: { path: ['res', '0', 'actions'], value: 5, max: 9, cheat: 'extraActions' } }]);
  });
  it('K738: allowCheats off gives no edits; cheatProblem refuses cheats without it', () => {
    const c = { allowCheats: false, cheats: { commandos: 1 } };
    expect(cheatActions(defs, c, state, 'setup')).toEqual([]);
    expect(cheatProblem(defs, c)).toMatch(/allowCheats/);
    expect(cheatProblem(defs, { allowCheats: true, cheats: { commandos: 4 } })).toMatch(/bad value/);
    expect(cheatProblem(defs, { allowCheats: true, cheats: { nope: 1 } })).toMatch(/no cheat/);
    expect(cheatProblem(defs, { allowCheats: true, cheats: { commandos: 1, fury: false } })).toBeNull();
  });
  it('K738: edges of cheatProblem, cheatFields and cheatsFrom (out of range, allowCheats off, unknown id)', () => {
    expect(cheatProblem(defs, {})).toBeNull();
    expect(cheatProblem(defs, { allowCheats: false })).toBeNull();
    expect(cheatProblem(defs, { allowCheats: false, cheats: { fury: true } })).toMatch(/allowCheats/);
    expect(cheatProblem(defs, { cheats: { commandos: 0 } })).toMatch(/allowCheats/);
    expect(cheatProblem(defs, { allowCheats: true, cheats: { commandos: -1 } })).toMatch(/bad value for "commandos"/);
    expect(cheatProblem(defs, { allowCheats: true, cheats: { commandos: 1.5 } })).toMatch(/bad value/);
    expect(cheatProblem(defs, { allowCheats: true, cheats: { commandos: 3, extraActions: 5 } })).toBeNull();
    expect(cheatProblem(defs, { allowCheats: true, cheats: { extraActions: 6 } })).toMatch(/bad value for "extraActions"/);
    expect(cheatProblem(defs, { allowCheats: true, cheats: { fury: 1 } })).toMatch(/bad value for "fury"/);
    expect(cheatProblem(defs, { allowCheats: true, cheats: { commandos: true } })).toMatch(/bad value/);
    expect(cheatProblem(defs, { allowCheats: true, cheats: { ghost: true } })).toBe('cheats: no cheat "ghost"');
    expect(cheatFields(defs, false)).toEqual([]);
    expect(cheatFields([], true)).toEqual([]);
    expect(cheatFields(defs, true, { off: 'No', on: 'Yes' })[1]).toEqual({ key: 'cheat.fury', label: 'Full fury', default: 'off', options: [{ value: 'off', label: 'No' }, { value: 'on', label: 'Yes' }] });
    expect(cheatFields(defs, true)[2]?.options.map((o) => o.value)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(cheatsFrom(defs, { seats: [], 'cheat.ghost': '3', 'cheat.commandos': 'x', 'cheat.fury': 'off' })).toEqual({});
    expect(cheatsFrom([], { seats: [], 'cheat.commandos': '2' })).toEqual({});
    expect(cheatActions(defs, { allowCheats: true }, state, 'setup')).toEqual([]);
    expect(cheatActions(defs, { allowCheats: true, cheats: { ghost: 2, commandos: 0, fury: false } }, state, 'setup')).toEqual([]);
  });
  it('K738: cheatedOf is true once any debug edit is played', () => {
    expect(cheatedOf([{ kind: 'answer', promptId: 1, picks: [] }])).toBe(false);
    expect(cheatedOf([{ kind: 'answer' }, { kind: 'debug', verb: 'set' }])).toBe(true);
  });
  it('K738: the set-up form shows the cheat fields only with allowCheats, and cheatsFrom reads them back', () => {
    const off = render(<SetupForm spec={{ extra: cheatFields(defs, false) }} onStart={() => {}} />);
    expect(off.container.querySelector('[data-field^="cheat."]')).toBeNull();
    off.unmount();
    const spec = { extra: cheatFields(defs, true) };
    const on = render(<SetupForm spec={spec} onStart={() => {}} />);
    expect([...on.container.querySelectorAll('[data-field^="cheat."]')].map((e) => e.getAttribute('data-field'))).toEqual(['cheat.commandos', 'cheat.fury', 'cheat.extraActions']);
    expect(on.container.querySelectorAll('[data-field="cheat.commandos"] option').length).toBe(4);
    expect(cheatsFrom(defs, defaultSetup(spec))).toEqual({});
    expect(cheatsFrom(defs, { seats: [], 'cheat.commandos': '2', 'cheat.fury': 'on', 'cheat.extraActions': '0' })).toEqual({ commandos: 2, fury: true });
  });
});
