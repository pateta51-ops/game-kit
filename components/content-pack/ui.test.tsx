import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Registry } from './expansion.ts';
import { ExpansionPicker } from './ui.ts';

const reg: Registry = [
  { id: 'core', name: 'Core' },
  { id: 'a', name: 'Alpha', kind: 'expansion', dependsOn: ['core'] },
  { id: 'b', name: 'Beta', kind: 'expansion', dependsOn: ['a'] },
  { id: 'v', name: 'Var', kind: 'variant', dependsOn: ['core'] },
  { id: 'z', name: 'Zed', kind: 'expansion', dependsOn: ['core'], unavailable: 'Not checked' },
];
function Host({ initial = [] as string[] }) {
  const [t, set] = useState(initial);
  return <ExpansionPicker registry={reg} base="core" ticked={t} onChange={set} />;
}
const box = (name: string) => screen.getByLabelText<HTMLInputElement>(new RegExp(name));

describe('ExpansionPicker (K361)', () => {
  it('ticks what a product needs and unticks its dependents', () => {
    render(<Host />);
    fireEvent.click(box('Beta'));
    expect(box('Alpha').checked).toBe(true);
    expect(box('Beta').checked).toBe(true);
    fireEvent.click(box('Alpha'));
    expect(box('Beta').checked).toBe(false);
    expect(box('Alpha').checked).toBe(false);
  });
  it('shows the base ticked and locked, a variant note and an unavailable one disabled', () => {
    render(<Host />);
    expect(box('Core').checked).toBe(true);
    expect(box('Core').disabled).toBe(true);
    expect(screen.getByText(/\(variant\)/)).toBeTruthy();
    expect(box('Zed').disabled).toBe(true);
    expect(screen.getByText('Not checked')).toBeTruthy();
  });
  it('says so when nothing needs the base', () => {
    render(<ExpansionPicker registry={[{ id: 'core' }]} base="core" ticked={[]} onChange={() => undefined} words={{ empty: 'None' }} />);
    expect(screen.getByTestId('expansion-empty')).toHaveTextContent('None');
  });
});
