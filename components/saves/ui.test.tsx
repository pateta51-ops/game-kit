import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createGame, newHistory, recordAction, type History } from '../engine-core/index.ts';
import { CONTENT, COUNTER, randomAnswer, RULES, type Counter } from '../engine-core/fake/counter.ts';
import { makeSaves } from './index.ts';
import { SavesScreen } from './ui.ts';
import { createElement } from 'react';

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

  it('rename: only named saves get the button; the name becomes a field and Save stores the new name', async () => {
    const saves = mk();
    await saves.writeAutosave(played('e', 1), 'Current game');
    await saves.saveNamed('One', played('e', 2));
    render(<SavesScreen saves={saves} history={null} summary={summary} onLoad={() => undefined} rename />);
    await screen.findByText('One');
    expect(screen.getAllByTestId('save-rename')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('save-rename'));
    fireEvent.change(screen.getByTestId('save-rename-name'), { target: { value: ' Two ' } });
    fireEvent.click(screen.getByTestId('save-rename'));
    expect(await screen.findByText('Two')).toBeInTheDocument();
    expect((await saves.listNamed()).map(([, v]) => v.name)).toEqual(['Two']);
  });

  it('confirmDelete needs a second tap; renderImport opens the hidden file input; rows replay once', async () => {
    const saves = mk();
    await saves.saveNamed('One', played('d', 2));
    const restore = vi.spyOn(saves, 'restore');
    render(
      <SavesScreen
        saves={saves}
        history={null}
        summary={summary}
        onLoad={() => undefined}
        confirmDelete
        renderImport={(open, label) => <button type="button" data-testid="my-import" onClick={open}>{label}</button>}
      />,
    );
    await screen.findByText('One');
    fireEvent.change(screen.getByTestId('save-name'), { target: { value: 'x' } });
    expect(restore).toHaveBeenCalledTimes(1);
    const click = vi.spyOn(screen.getByTestId('save-import'), 'click');
    expect(screen.getByTestId('save-import')).not.toBeVisible();
    fireEvent.click(screen.getByTestId('my-import'));
    expect(click).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('save-delete'));
    expect(screen.getByTestId('save-delete').textContent).toBe('Tap again to delete');
    expect(screen.getByText('One')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('save-delete'));
    await waitFor(() => expect(screen.queryByText('One')).toBeNull());
  });

  it('K387: buttonClass lands on every button; renderButton replaces each and still wires onClick and disabled', async () => {
    const saves = mk();
    await saves.writeAutosave(played('k', 2), 'Current game');
    const onLoad = vi.fn();
    const { unmount } = render(<SavesScreen saves={saves} history={null} summary={summary} onLoad={onLoad} rename buttonClass="mine" />);
    await screen.findByTestId('save-row');
    for (const id of ['save-load', 'save-export', 'save-delete', 'save-new']) expect(screen.getByTestId(id).className).toContain('mine');
    expect(screen.getByTestId('save-load').className).toContain('kit-sav-btn');
    unmount();
    render(
      <SavesScreen saves={saves} history={null} summary={summary} onLoad={onLoad}
        renderButton={(b) => createElement('a', { className: b.className, 'data-testid': b.testId, 'data-kind': b.kind, 'aria-disabled': b.disabled, onClick: b.onClick }, b.label)} />,
    );
    await screen.findByTestId('save-row');
    expect(screen.getByTestId('save-load').tagName).toBe('A');
    expect(screen.getByTestId('save-load').getAttribute('data-kind')).toBe('load');
    expect(screen.getByTestId('save-new').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByTestId('save-load'));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });
});
