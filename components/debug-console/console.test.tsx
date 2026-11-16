import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseDebug } from './index.ts';
import { DebugConsole } from './ui.ts';

const verbs = ['set', 'force', 'close', 'summon'];

describe('parseDebug (K100)', () => {
  it('reads the kernel verbs and game verbs', () => {
    expect(parseDebug('/set marks.added.0 5 0 9', verbs)).toEqual({ kind: 'debug', verb: 'set', args: { path: ['marks', 'added', 0], value: 5, min: 0, max: 9 } });
    expect(parseDebug('force 2 1 name=add', verbs)).toEqual({ kind: 'debug', verb: 'force', args: { name: 'add', values: [2, 1] } });
    expect(parseDebug('/close', verbs)).toEqual({ kind: 'debug', verb: 'close' });
    expect(parseDebug('/summon 9 to="hand zone"', verbs, { summon: ['card'] })).toEqual({ kind: 'debug', verb: 'summon', args: { to: 'hand zone', card: 9 } });
  });

  it('says why a line is not a command', () => {
    expect(parseDebug('', verbs)).toEqual({ error: 'Type a command.' });
    expect(parseDebug('/fly', verbs)).toMatchObject({ error: expect.stringMatching(/Unknown command "fly"/) as unknown });
    expect(parseDebug('/set counter x', verbs)).toMatchObject({ error: expect.stringMatching(/^Use: set/) as unknown });
    expect(parseDebug('/summon 9', verbs)).toMatchObject({ error: 'summon takes only key=value.' });
  });
});

describe('DebugConsole', () => {
  it('sends a parsed edit and shows a refusal', () => {
    const send = vi.fn().mockReturnValueOnce(undefined).mockReturnValueOnce('DEBUG_REFUSED: no prompt is open');
    render(<DebugConsole verbs={verbs} send={send} />);
    const box = screen.getByLabelText('Debug command');
    fireEvent.change(box, { target: { value: '/close' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ kind: 'debug', verb: 'close' });
    expect(box).toHaveValue('');
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box).toHaveValue('/close');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByTestId('debug-console')).toHaveTextContent('DEBUG_REFUSED: no prompt is open');
  });
});
