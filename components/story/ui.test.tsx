import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Story } from './index';
import { StorySheet } from './ui';

const S: Story = {
  speakers: [{ id: 'cap', name: 'Cap' }],
  scenarios: [{ id: 's', title: 'S', sheet: [
    { id: 'before', title: 'Before', beats: [{ lines: [{ speaker: 'cap', text: 'Hi', fallback: 'Narrated' }] }] },
    { id: 'after', title: 'After', beats: [{ lines: [{ text: 'Done' }], picture: { file: 'a.png', note: 'A harbour' } }] },
  ] }],
};

describe('StorySheet', () => {
  it('hides later parts, falls back to narrator, shows the note', () => {
    const { rerender } = render(<StorySheet story={S} scenarioId="s" reached={['before']} inPlay={[]} />);
    expect(screen.getByText('Narrated')).toBeTruthy();
    expect(screen.queryByText('After')).toBeNull();
    rerender(<StorySheet story={S} scenarioId="s" reached={['after']} inPlay={['cap']} />);
    expect(screen.getByText('Hi')).toBeTruthy();
    expect(screen.getByText('Cap')).toBeTruthy();
    expect(screen.getByText('A harbour')).toBeTruthy();
    rerender(<StorySheet story={S} scenarioId="s" reached={['after']} inPlay={[]} fileExists={() => true} />);
    expect(screen.queryByText('A harbour')).toBeNull();
  });
});
