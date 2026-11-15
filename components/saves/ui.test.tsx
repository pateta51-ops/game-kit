import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createGame, newHistory, recordAction, type History } from '../engine-core';
import { CONTENT, COUNTER, randomAnswer, RULES, type Counter } from '../engine-core/fake/counter';
import { makeSaves } from './index';
import { SavesScreen } from './ui';

let db = 0;
const mk = () => makeSaves<Counter>({ game: COUNTER, content: CONTENT, database: `ui-saves-${String(db++)}`, filePrefix: 'neutral' });

function played(seed: string, n: number): History<Counter> {
  let h = newHistory<Counter>({ seed }, RULES);
  let state = createGame(COUNTER, { seed }, RULES, CONTENT).state;
  for (let i = 0; i < n; i++) {
    const r = recordAction(COUNTER, h, randomAnswer(state, seed), CONTENT);
    h = r.history;
    state = r.state as typeof state;
  }
  return h;
}

const summary = (s: { counter: number }) => `Counter ${String(s.counter)}`;

describe('SavesScreen', () => {
  it('shows the autosave with the game summary line; Continue loads it; Export downloads under the export name', async () => {
    const saves = mk();
    await saves.writeAutosave(played('a', 3), 'Current game');
    const onLoad = vi.fn();
    const download = vi.fn(() => true);
    render(<SavesScreen saves={saves} history={null} summary={summary} onLoad={onLoad} download={download} />);
    const row = await screen.findByTestId('save-row');
    expect(row.textContent).toMatch(/Counter \d+/);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onLoad).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(download).toHaveBeenCalledWith(expect.stringContaining('"finalHash"'), expect.stringMatching(/^neutral-.*\.json$/));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves the game being played under a name (empty: the unnamed word), lists it, deletes it; a failed load says why', async () => {
    const saves = mk();
    render(
      <SavesScreen saves={saves} history={played('b', 2)} summary={summary} onLoad={() => 'Not now.'} words={{ unnamed: 'Untitled' }} />,
    );
    expect(await screen.findByTestId('no-autosave')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('save-name'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByTestId('save-note').textContent).toBe('Saved.'));
    expect(await screen.findByText('Untitled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByTestId('save-note').textContent).toBe('Not now.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Untitled')).toBeNull());
  });

  it('a save that does not load shows the reason and offers only Delete; import of a bad file says why', async () => {
    const saves = mk();
    const key = await saves.saveNamed('Edited', played('c', 2));
    const other = makeSaves<Counter>({ game: COUNTER, content: { cards: 7 }, database: `ui-saves-${String(db - 1)}`, filePrefix: 'n' });
    render(<SavesScreen saves={other} history={null} summary={summary} onLoad={() => undefined} />);
    const row = await screen.findByTestId('save-row');
    expect(row.getAttribute('data-slot')).toBe(key);
    expect(row.textContent).toContain('This save is from an older build. It cannot be loaded; you can delete it.');
    expect(screen.queryByRole('button', { name: 'Load' })).toBeNull();
    const file = new File(['nope'], 'bad.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('save-import'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('save-note').textContent).toBe('This is not a save file.'));
  });
});
