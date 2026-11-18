import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Sheet } from './Sheet.tsx';
import { filterEntries, filterFromHash, hashWithFilter, type SheetEntry } from './sheet.ts';

const Boom = (): never => {
  throw new Error('no art');
};
const entries: SheetEntry[] = [
  { id: 'button', label: 'Button', render: () => <button type="button">Go</button>, states: [{ label: 'disabled', render: () => <button type="button" disabled>Stop</button> }] },
  { id: 'tray', label: 'Dice tray', render: () => <p>tray</p> },
  { id: 'bad', label: 'Broken', render: () => <Boom /> },
];
const two = entries.slice(0, 2);

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('Sheet', () => {
  it('renders every entry in a labelled section, and its states', () => {
    render(<Sheet dev entries={two} hash="" />);
    expect(screen.getAllByTestId('sheet-entry').map((s) => s.getAttribute('data-id'))).toEqual(['button', 'tray']);
    expect(screen.getByRole('heading', { name: 'Dice tray' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'disabled' })).toBeInTheDocument();
    expect(screen.getByText('Stop')).toBeDisabled();
  });
  it('narrows by the filter in the hash', () => {
    render(<Sheet dev entries={two} hash="#/dev/sheet?q=dice" />);
    expect(screen.getAllByTestId('sheet-entry')).toHaveLength(1);
    expect(screen.getByText('tray')).toBeInTheDocument();
  });
  it('keeps a typed filter in the window hash', () => {
    window.history.replaceState(null, '', '/#/dev/sheet');
    render(<Sheet dev entries={two} />);
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'but' } });
    expect(window.location.hash).toBe('#/dev/sheet?q=but');
    expect(screen.getAllByTestId('sheet-entry')).toHaveLength(1);
  });
  it('a throwing entry shows its message and the rest stay', () => {
    render(<Sheet dev entries={entries} hash="" />);
    expect(screen.getByTestId('sheet-error')).toHaveTextContent('no art');
    expect(screen.getByText('tray')).toBeInTheDocument();
  });
});

describe('Sheet more', () => {
  it('renders nothing outside dev', () => {
    render(<Sheet dev={false} entries={two} hash="" />);
    expect(screen.queryByTestId('sheet')).toBeNull();
  });
  it('follows hashchange', () => {
    render(<Sheet dev entries={two} />);
    expect(screen.getAllByTestId('sheet-entry')).toHaveLength(2);
    act(() => {
      window.history.replaceState(null, '', '/#q=tray');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getAllByTestId('sheet-entry')).toHaveLength(1);
  });
  it('a throwing state shows its message beside the others', () => {
    const e: SheetEntry = { id: 's', label: 'S', render: () => <p>ok</p>, states: [{ label: 'bad', render: () => <Boom /> }] };
    render(<Sheet dev entries={[e]} hash="" />);
    expect(screen.getByTestId('sheet-error')).toHaveTextContent('no art');
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
  it('variant toggle re-renders the entry; width toggle sets the body; index lists sections', () => {
    const e: SheetEntry = { id: 'v', label: 'V', variants: { side: ['basic', 'advanced'] }, render: (p) => <p>side {p.side}</p> };
    render(<Sheet dev entries={[e]} hash="" />);
    expect(screen.getByText('side basic')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'advanced' }));
    expect(screen.getByText('side advanced')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wide' }));
    expect(screen.getByTestId('sheet-body')).toHaveAttribute('data-width', 'narrow');
    expect(screen.getByRole('link', { name: 'V' })).toHaveAttribute('href', '#sheet-v');
  });
});

describe('hash filter', () => {
  it('reads and writes q', () => {
    expect(filterFromHash('#/dev/sheet?q=a%20b')).toBe('a b');
    expect(filterFromHash('#q=x')).toBe('x');
    expect(filterFromHash('#/dev/sheet')).toBe('');
    expect(hashWithFilter('#/dev/sheet?q=old', 'new')).toBe('#/dev/sheet?q=new');
    expect(hashWithFilter('#/dev/sheet?q=old', '')).toBe('#/dev/sheet');
    expect(hashWithFilter('', 'x')).toBe('#q=x');
    expect(hashWithFilter('#/dev/sheet?q=a&x=1', 'b')).toBe('#/dev/sheet?q=b&x=1');
    expect(hashWithFilter('#a=1&q=x', 'new')).toBe('#a=1&q=new');
    expect(hashWithFilter('#a=1&q=x', '')).toBe('#a=1');
    expect(filterEntries(entries, ' BUT ').map((e) => e.id)).toEqual(['button']);
  });
});
