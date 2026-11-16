import { describe, expect, it } from 'vitest';
import { pictureView, resolveLine, sheetView, slotBeats, storyProblems, type Story } from './index.ts';

const S: Story = {
  speakers: [{ id: 'cap', name: 'Cap' }],
  scenarios: [{
    id: 's1', title: 'One',
    slots: { intro: [{ lines: [{ speaker: 'cap', text: 'Hi', fallback: 'Someone nods.' }, { speaker: 'cap', text: 'Gone' }] }], win: [{ lines: [{ speaker: 'cap', text: 'x' }] }] },
    stages: { 2: [{ lines: [{ text: 'Stage two' }] }] },
    sheet: [{ id: 'before', beats: [{ lines: [{ text: 'a' }] }] }, { id: 'after', beats: [{ lines: [{ text: 'b' }], picture: { file: 'p.png', note: 'A city' } }] }],
  }],
};

describe('story', () => {
  it('named line in play stays, else falls back to narrator, else dropped', () => {
    expect(resolveLine(S, { speaker: 'cap', text: 'Hi' }, ['cap'])).toMatchObject({ speaker: 'cap', name: 'Cap' });
    expect(resolveLine(S, { speaker: 'cap', text: 'Hi', fallback: 'F' }, [])).toMatchObject({ speaker: 'narrator', text: 'F', fallenBack: true });
    expect(resolveLine(S, { speaker: 'cap', text: 'Hi' }, [])).toBeNull();
  });
  it('slots and stages resolve, empty beats are left out', () => {
    expect(slotBeats(S, 's1', 'intro', [])[0]?.lines.map((l) => l.text)).toEqual(['Someone nods.']);
    expect(slotBeats(S, 's1', 'win', [])).toEqual([]);
    expect(slotBeats(S, 's1', { stage: 2 }, [])).toHaveLength(1);
    expect(slotBeats(S, 's1', 'loss', [])).toEqual([]);
    expect(slotBeats(S, 'nope', 'intro', [])).toEqual([]);
  });
  it('later parts are hidden until reached', () => {
    expect(sheetView(S, 's1', [], []).map((p) => p.id)).toEqual(['before']);
    expect(sheetView(S, 's1', ['before'], []).map((p) => p.id)).toEqual(['before']);
    expect(sheetView(S, 's1', ['after'], []).map((p) => p.id)).toEqual(['before', 'after']);
  });
  it('picture shows its note until the file exists', () => {
    const p = { file: 'p.png', note: 'A city' };
    expect(pictureView(p, () => false)).toEqual({ kind: 'note', note: 'A city' });
    expect(pictureView(p, (f) => f === 'p.png')).toEqual({ kind: 'file', file: 'p.png' });
    expect(pictureView({ note: 'n' }, () => true)).toEqual({ kind: 'note', note: 'n' });
  });
  it('storyProblems', () => {
    expect(storyProblems(S)).toEqual([]);
    expect(storyProblems({ speakers: [], scenarios: [{ id: 'a', title: '', slots: { win: [{ lines: [{ speaker: 'zz', text: '' }] }] }, sheet: [] }] })).toEqual(['a: unknown speaker "zz"']);
  });
});
