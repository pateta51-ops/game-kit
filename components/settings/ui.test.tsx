import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createSettingsStore, resolutionSetting, type SettingsSchema } from './index';
import { SettingsScreen } from './ui';

const schema = {
  storageKey: 'test.ui.settings',
  sections: [
    {
      id: 'a',
      title: 'Section A',
      settings: [
        { kind: 'toggle', key: 'flagA', label: 'Flag A', hint: 'A hint', default: false },
        { kind: 'choice', key: 'mode', label: 'Mode', default: 'one', options: [{ value: 'one', label: 'One', line: 'First' }, { value: 'two', label: 'Two' }] },
        resolutionSetting('res', 'Resolution', 'Window'),
      ],
    },
    { id: 'd', title: 'Dev section', settings: [{ kind: 'toggle', key: 'flagB', label: 'Flag B', default: false, dev: true }] },
  ],
} as const satisfies SettingsSchema;

describe('SettingsScreen', () => {
  it('draws the schema and writes each change to the store', () => {
    localStorage.clear();
    const store = createSettingsStore(schema);
    render(<SettingsScreen schema={schema} store={store} />);
    expect(screen.getByRole('group', { name: 'Section A' })).toBeTruthy();
    expect(screen.queryByText('Dev section')).toBeNull();
    expect(screen.getByText('A hint')).toBeTruthy();
    fireEvent.click(screen.getByTestId('setting-flagA'));
    expect(store.getState().values.flagA).toBe(true);
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('setting-mode-two'));
    expect(store.getState().values.mode).toBe('two');
    fireEvent.change(screen.getByTestId('setting-res'), { target: { value: 'window' } });
    expect(store.getState().values.res).toBe('window');
    expect((JSON.parse(localStorage.getItem('test.ui.settings') ?? '{}') as { state: { values: { mode: string } } }).state.values.mode).toBe('two');
  });

  it('shows dev settings with dev; two screens get distinct ids', () => {
    const store = createSettingsStore(schema);
    const { container } = render(
      <>
        <SettingsScreen schema={schema} store={store} dev />
        <SettingsScreen schema={schema} store={store} dev />
      </>,
    );
    expect(screen.getAllByText('Dev section')).toHaveLength(2);
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = new Set([...container.querySelectorAll('input[type=radio]')].map((e) => (e as HTMLInputElement).name));
    expect(names.size).toBe(2);
  });
});
