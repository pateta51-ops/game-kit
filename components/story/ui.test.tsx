import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Story } from './index.ts';
import { PageView, StorySheet } from './ui.ts';
import type { Page } from './page.ts';

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

describe('PageView entries', () => {
  it('overlay changed, list, card note, footnote', () => {
    const page: Page = { id: 'p', entries: [{ t: 'text', key: 'a' }, { t: 'list', items: [{ t: 'text', key: 'b' }] }, { t: 'card', card: 'c1', note: 'n' }, { t: 'footnote', n: 2, key: 'f' }] };
    const { container } = render(<PageView page={page} texts={{ a: 'A', b: 'B', n: 'Note', f: 'Foot' }} overlay={{ n: 'Note2', a: 'A2' }} log={[]} renderCard={(c) => <i>{c}</i>} />);
    expect(container.querySelector('li')?.textContent).toBe('B');
    expect(container.querySelector('figcaption')?.textContent).toBe('Note2');
    expect(container.querySelector('figure i')?.textContent).toBe('c1');
    expect(container.querySelector('.kit-page-footnote')?.textContent).toContain('Foot');
    expect(container.querySelector('.kit-page-changed')?.textContent).toBe('A2');
  });
});

describe('PageView', () => {
  it('marks applied and invalid branches', () => {
    const page: Page = { id: 'p', entries: [{ t: 'branch', cases: [{ when: 'x', entry: { t: 'text', key: 'a' } }, { entry: { t: 'text', key: 'b' } }] }] };
    const { container } = render(<PageView page={page} texts={{ a: 'Yes', b: 'No' }} log={['x']} />);
    expect(container.querySelectorAll('.kit-page-valid').length).toBe(1);
    expect(container.querySelector('.kit-page-invalid')?.textContent).toBe('No');
  });
});
