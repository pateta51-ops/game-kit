import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { defaultSetup, validateSetup, type SetupSpec } from './index.ts';
import { MainMenu, SetupForm } from './ui.ts';

const spec: SetupSpec = {
  seats: { min: 1, max: 3, kinds: [{ value: 'human', label: 'Human' }, { value: 'bot', label: 'Bot' }] },
  scenarios: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
  difficulties: [{ value: 'easy', label: 'Easy' }, { value: 'hard', label: 'Hard' }],
  extra: [{ key: 'mode', label: 'Mode', options: [{ value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] }],
};

describe('model', () => {
  it('defaults come from the spec and validate', () => {
    const d = defaultSetup(spec);
    expect(d).toEqual({ seats: [{ kind: 'human' }], scenario: 'a', difficulty: 'easy', mode: 'x' });
    expect(validateSetup(spec, d)).toEqual([]);
  });
  it('reports bad seat count, kind, scenario and extra', () => {
    const d = defaultSetup(spec);
    expect(validateSetup(spec, { ...d, seats: [] })).toEqual(['seats']);
    expect(validateSetup(spec, { ...d, seats: Array.from({ length: 4 }, () => ({ kind: 'human' })) })).toEqual(['seats']);
    expect(validateSetup(spec, { ...d, seats: [{ kind: 'zz' }], scenario: 'q', mode: 'n' })).toEqual(['seat-kind', 'scenario', 'mode']);
  });
});

describe('MainMenu', () => {
  it('selects enabled entries only', () => {
    const f = vi.fn();
    render(<MainMenu entries={[{ id: 'new', label: 'New' }, { id: 'cont', label: 'Continue', disabled: true }]} onSelect={f} />);
    fireEvent.click(screen.getByText('Continue'));
    fireEvent.click(screen.getByText('New'));
    expect(f.mock.calls).toEqual([['new']]);
  });
});

describe('SetupForm', () => {
  it('starts with the chosen seats, scenario, difficulty and extra', () => {
    const f = vi.fn();
    render(<SetupForm spec={spec} onStart={f} />);
    fireEvent.change(screen.getByLabelText('Players'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Seat 2'), { target: { value: 'bot' } });
    fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: 'b' } });
    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'hard' } });
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'y' } });
    fireEvent.click(screen.getByText('Start'));
    expect(f).toHaveBeenCalledWith({ seats: [{ kind: 'human' }, { kind: 'bot' }], scenario: 'b', difficulty: 'hard', mode: 'y' });
  });
  it('blocks start on an invalid seat count', () => {
    const f = vi.fn();
    render(<SetupForm spec={spec} onStart={f} words={{ start: 'Go' }} initial={{ ...defaultSetup(spec), seats: [] }} />);
    expect(screen.getByText<HTMLButtonElement>('Go').disabled).toBe(true);
    fireEvent.submit(screen.getByText('Go').closest('form')!);
    expect(f).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
  it('clamps the seat count, overrides words and omits blank names', () => {
    const f = vi.fn();
    render(<SetupForm spec={{ ...spec, seats: { ...spec.seats!, names: true } }} onStart={f} words={{ start: 'Go', seats: 'How many' }} />);
    fireEvent.change(screen.getByLabelText('How many'), { target: { value: '1000000000' } });
    expect(screen.getAllByRole('combobox', { name: /^Seat / })).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('How many'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Name 1'), { target: { value: 'Ann' } });
    fireEvent.click(screen.getByText('Go'));
    expect(f).toHaveBeenCalledWith({ seats: [{ kind: 'human', name: 'Ann' }, { kind: 'human' }], scenario: 'a', difficulty: 'easy', mode: 'x' });
  });
});

describe('K300 seams', () => {
  it('MainMenu takes a node label and keeps click and data-entry', () => {
    const f = vi.fn();
    render(<MainMenu entries={[{ id: 'new', label: <><b>Title</b><small>Meaning</small></> }]} onSelect={f} />);
    fireEvent.click(screen.getByText('Meaning'));
    expect(f).toHaveBeenCalledWith('new');
    expect(document.querySelector('[data-entry="new"] b')).toBeTruthy();
  });
  const solo: SetupSpec = { many: [{ key: 'crew', label: 'Crew', min: 1, max: 2, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }] }], scenarios: [{ value: 's', label: 'S' }] };
  it('seats are optional: no seat UI, setup has no seats', () => {
    const f = vi.fn();
    render(<SetupForm spec={solo} onStart={f} />);
    expect(screen.queryByLabelText('Players')).toBeNull();
    fireEvent.click(screen.getByText('Start'));
    expect(f).toHaveBeenCalledWith({ seats: [], scenario: 's', crew: ['a'] });
  });
  it('select-many enforces min and max', () => {
    const f = vi.fn();
    render(<SetupForm spec={solo} onStart={f} />);
    const box = (n: string) => screen.getByLabelText<HTMLInputElement>(n);
    expect(box('A').disabled).toBe(true);
    fireEvent.click(box('C'));
    expect(box('B').disabled).toBe(true);
    fireEvent.click(box('A'));
    fireEvent.click(screen.getByText('Start'));
    expect(f).toHaveBeenCalledWith({ seats: [], scenario: 's', crew: ['c'] });
    expect(validateSetup(solo, { seats: [], scenario: 's', crew: [] })).toEqual(['crew']);
    expect(validateSetup(solo, { seats: [], scenario: 's', crew: ['a', 'b', 'c'] })).toEqual(['crew']);
  });
  it('controlled mode reports changes and follows value', () => {
    const f = vi.fn();
    const v = defaultSetup(spec);
    const { rerender } = render(<SetupForm spec={spec} value={v} onChange={f} onStart={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Scenario'), { target: { value: 'b' } });
    expect(f).toHaveBeenCalledWith({ ...v, scenario: 'b' });
    expect(screen.getByLabelText<HTMLSelectElement>('Scenario').value).toBe('a');
    rerender(<SetupForm spec={spec} value={{ ...v, scenario: 'b' }} onChange={f} onStart={vi.fn()} />);
    expect(screen.getByLabelText<HTMLSelectElement>('Scenario').value).toBe('b');
  });
  it('renderField replaces a field', () => {
    const f = vi.fn();
    render(<SetupForm spec={spec} onStart={f} renderField={(fl, _v, set) => fl.key === 'mode' ? <button type="button" onClick={() => set('y')}>pick-y</button> : undefined} />);
    fireEvent.click(screen.getByText('pick-y'));
    fireEvent.click(screen.getByText('Start'));
    expect((f.mock.calls[0]![0] as { mode: string }).mode).toBe('y');
  });
});
