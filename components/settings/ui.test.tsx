import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createSettingsStore, resolutionSetting, type SettingsSchema } from './index.ts';
import { SettingsScreen } from './ui.ts';

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

  it('plates mode: buttons with labels, the chosen one pressed, no radio or checkbox', () => {
    localStorage.clear();
    const store = createSettingsStore(schema);
    const { container } = render(<SettingsScreen schema={schema} store={store} look="plates" showLine />);
    expect(container.querySelector('input[type=radio], input[type=checkbox]')).toBeNull();
    const on = screen.getByRole('button', { name: 'On' });
    const off = screen.getByRole('button', { name: 'Off' });
    expect(off.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(on);
    expect(store.getState().values.flagA).toBe(true);
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(on.className).toContain('kit-set-plate-on');
    expect(screen.getByTestId('setting-mode-line').textContent).toBe('First');
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    expect(screen.queryByTestId('setting-mode-line')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    expect(store.getState().values.mode).toBe('two');
    expect(screen.getByRole('button', { name: 'Two' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'One' }).getAttribute('aria-pressed')).toBe('false');
  });
  it('draws extra rows inside a section and children after the sections', () => {
    localStorage.clear();
    const store = createSettingsStore(schema);
    render(
      <SettingsScreen schema={schema} store={store} extra={{ a: <p data-testid="x">row</p> }}>
        <p data-testid="tail">tail</p>
      </SettingsScreen>,
    );
    expect(screen.getByTestId('x').closest('fieldset')?.textContent).toContain('Section A');
    expect(screen.getByTestId('tail').parentElement?.className).toBe('kit-set');
  });

  it('range: writes the store on change, onRelease only on release', () => {
    localStorage.clear();
    const rs = { storageKey: 'test.range', sections: [{ id: 'v', title: 'Sound', settings: [{ kind: 'range', key: 'vol', label: 'Volume', min: 0, max: 100, step: 10, default: 50 }] }] } as const satisfies SettingsSchema;
    const store = createSettingsStore(rs);
    const seen: [string, number][] = [];
    render(<SettingsScreen schema={rs} store={store} onRelease={(k, v) => seen.push([k, v])} />);
    fireEvent.change(screen.getByTestId('setting-vol'), { target: { value: '70' } });
    expect(store.getState().values.vol).toBe(70);
    expect(seen).toEqual([]);
    fireEvent.pointerUp(screen.getByTestId('setting-vol'));
    expect(seen).toEqual([['vol', 70]]);
    fireEvent.keyUp(screen.getByTestId('setting-vol'), { key: 'Tab' });
    expect(seen.length).toBe(1);
    fireEvent.keyUp(screen.getByTestId('setting-vol'), { key: 'ArrowRight' });
    expect(seen.length).toBe(2);
  });

  it('K387: plateClass lands on every section; renderPlate replaces the container and keeps the settings inside', () => {
    localStorage.clear();
    const store = createSettingsStore(schema);
    const { container, unmount } = render(<SettingsScreen schema={schema} store={store} plateClass="mine" />);
    expect(container.querySelectorAll('.kit-set-section.mine')).toHaveLength(1);
    unmount();
    render(
      <SettingsScreen schema={schema} store={store} plateClass="mine"
        renderPlate={(p) => <section data-testid="plate" className={p.className}><h3 id={p.titleId}>{p.title}</h3>{p.children}</section>} />,
    );
    expect(screen.getByTestId('plate').className).toBe('kit-set-section mine');
    expect(screen.getByText('Section A').tagName).toBe('H3');
    fireEvent.click(screen.getByTestId('setting-flagA'));
    expect(store.getState().values.flagA).toBe(true);
  });
});
