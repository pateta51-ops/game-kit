import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineMachine, IllegalTransitionError, setMachineMode } from './index';
import { step, useMachine } from './ui';

type Row = 'shut' | 'shown' | 'big';
type RowEvent = 'show' | 'grow' | 'shrink' | 'shut';
const ROW = defineMachine<Row, RowEvent>({
  id: 'uitest.row',
  initial: 'shut',
  states: {
    shut: { on: { show: 'shown' } },
    shown: { on: { grow: 'big', shut: 'shut', show: 'shown' } },
    big: { on: { shrink: 'shown', shut: 'shut' } },
  },
  describe: { purpose: 'A row that opens on one item.', source: 'components/state-machines/ui.test.tsx' },
});

afterEach(() => {
  setMachineMode('auto');
  vi.restoreAllMocks();
});

describe('useMachine', () => {
  it('starts in the initial state with no value; the value travels and is dropped on return', () => {
    const { result } = renderHook(() => useMachine<Row, RowEvent, { id: number }>(ROW));
    expect([result.current.state, result.current.data]).toEqual(['shut', null]);
    const send = result.current.send;
    act(() => send('show', { id: 4 }));
    expect([result.current.state, result.current.data]).toEqual(['shown', { id: 4 }]);
    act(() => send('grow'));
    expect([result.current.state, result.current.data]).toEqual(['big', { id: 4 }]);
    act(() => send('shrink', { id: 9 }));
    expect([result.current.state, result.current.data]).toEqual(['shown', { id: 9 }]);
    act(() => send('shut', { id: 1 }));
    expect([result.current.state, result.current.data]).toEqual(['shut', null]);
    expect(result.current.send).toBe(send);
  });

  it('two sends in one batch both apply', () => {
    const { result } = renderHook(() => useMachine<Row, RowEvent, string>(ROW));
    act(() => {
      result.current.send('show', 'a');
      result.current.send('grow');
    });
    expect([result.current.state, result.current.data]).toEqual(['big', 'a']);
  });

  it('a self-loop away from the initial state keeps the value; null clears it', () => {
    const { result } = renderHook(() => useMachine<Row, RowEvent, string>(ROW));
    act(() => result.current.send('show', 'a'));
    act(() => result.current.send('show'));
    expect([result.current.state, result.current.data]).toEqual(['shown', 'a']);
    act(() => result.current.send('show', undefined));
    expect(result.current.data).toBe('a');
    act(() => result.current.send('grow', null));
    expect([result.current.state, result.current.data]).toEqual(['big', null]);
  });

  it('an illegal event throws from send, not from a render, and changes nothing', () => {
    const { result } = renderHook(() => useMachine<Row, RowEvent, string>(ROW));
    act(() => result.current.send('show', 'a'));
    expect(() => result.current.send('shrink', 'b')).toThrow(IllegalTransitionError);
    act(() => result.current.send('grow'));
    expect([result.current.state, result.current.data]).toEqual(['big', 'a']);
  });

  it('strict mode, production: an illegal event logs once and keeps state and value; legal events apply once', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setMachineMode('log');
    const { result } = renderHook(() => useMachine<Row, RowEvent, string>(ROW), { wrapper: StrictMode });
    act(() => result.current.send('show', 'a'));
    act(() => result.current.send('shrink', 'b'));
    expect([result.current.state, result.current.data]).toEqual(['shown', 'a']);
    expect(log).toHaveBeenCalledTimes(1);
    act(() => result.current.send('grow'));
    expect([result.current.state, result.current.data]).toEqual(['big', 'a']);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('step: an illegal event throws, or in production returns the same position', () => {
    expect(() => step(ROW, { state: 'shut', data: null }, 'grow')).toThrow(IllegalTransitionError);
    expect(step(ROW, { state: 'shut', data: null }, 'show')).toEqual({ state: 'shown', data: null });
    expect(step(ROW, { state: 'shown', data: 'a' }, 'show', 'b')).toEqual({ state: 'shown', data: 'b' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setMachineMode('log');
    const cur = { state: 'shown' as Row, data: 'a' };
    expect(step(ROW, cur, 'shrink', 'b')).toBe(cur);
  });
});
