import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { BetweenScreen, ChangeList, HandledList, LogTabs, StartForm } from './ui';
import {
  answerBetween, betweenQuestion, changeRows, emptyLog, handledList, linear, logSections, newCampaign,
  record, reward, setCount, setInsert, startAt, stepKey, type FieldDef, type Step, type StartAnswer,
} from './index';

const s1: Step = { kind: 'scenario', id: 'a' }, s2: Step = { kind: 'scenario', id: 'b' };
const fields: FieldDef[] = [
  { id: 'met', kind: 'key', label: 'Met the stranger', cite: 'p.4' },
  { id: 'xp', kind: 'count', label: 'Experience', scope: 'player' },
  { id: 'allies', kind: 'set', label: 'Allies' },
  { id: 'secret', kind: 'key', label: 'Secret', hidden: true },
];

describe('between question', () => {
  it('offers continue and the actions that apply; a detour comes back', () => {
    const save = { ...newCampaign('c', '1', s2, 1), position: { step: s2, done: [stepKey(s1)], resolutions: {} } };
    const q = betweenQuestion(save, [{ id: 'up', label: 'Upgrade', kind: 'upgrade', step: 'u' }, { id: 'no', label: 'Hidden', kind: 'side', step: 'x', when: () => false }]);
    expect(q.options.map((o) => o.id)).toEqual(['continue', 'up']);
    expect(answerBetween(save, 'continue', q)).toBe(save);
    expect(answerBetween(save, 'up', q).position.step).toEqual({ kind: 'upgrade', id: 'u', then: s2 });
    expect(() => answerBetween(save, 'zz', q)).toThrow();
    expect(betweenQuestion({ ...save, position: { ...save.position, step: null } }).options).toEqual([]);
  });
  it('renders the options and reports the choice', () => {
    const save = newCampaign('c', '1', s1, 1);
    let got = '';
    render(<BetweenScreen q={betweenQuestion(save, [{ id: 'up', label: 'Upgrade', kind: 'upgrade', step: 'u' }])} onChoose={(id) => (got = id)} />);
    fireEvent.click(screen.getByTestId('between-up'));
    expect(got).toBe('up');
    expect(screen.getByTestId('between-continue')).toHaveTextContent('Continue');
  });
});

describe('log sections', () => {
  it('mirror the declared fields, per player, hidden left out', () => {
    let l = record(emptyLog(), 'met');
    l = setCount(l, 'p1/xp', 5, 'a');
    l = setInsert(l, 'allies', 'Ann');
    const sec = logSections(l, fields, ['p1', 'p2']);
    expect(sec.map((x) => x.id)).toEqual(['met', 'p1/xp', 'p2/xp', 'allies']);
    expect(sec[0]).toMatchObject({ recorded: true, cite: 'p.4' });
    expect(sec[1]?.value).toBe(5);
    render(<LogTabs sections={sec} />);
    expect(screen.getByTestId('log-allies')).toHaveTextContent('Ann');
  });
});

describe('change rows', () => {
  it('one row per instruction of the step', () => {
    let l = setCount(emptyLog(), 'p1/xp', 5, 'a');
    l = setCount(l, 'p1/xp', 8, 'b');
    l = reward(l, { step: 'b', label: 'Bought a card', amount: -4 });
    l = reward(l, { step: 'b', label: 'Scenario reward', amount: 3 });
    const rows = changeRows(l, 'b', fields);
    expect(rows.map((r) => `${r.label}: ${r.text}`)).toEqual(['Experience: 5 -> 8', 'Bought a card: spent 4', 'Scenario reward: earned 3']);
    expect(changeRows(l, 'b', fields, { spent: 'paid' })[1]?.text).toBe('paid 4');
    render(<ChangeList rows={rows} />);
    expect(screen.getByTestId('changes')).toHaveTextContent('spent 4');
  });
});

describe('handled for you', () => {
  it('lists the sentences that apply', () => {
    const l = record(emptyLog(), 'met');
    const items = handledList([{ id: 'a', say: 'The deck was shuffled.' }, { id: 'b', say: (x) => `Met: ${x.recorded.length}`, when: (x) => x.recorded.includes('met') }, { id: 'c', say: 'no', when: () => false }], l);
    expect(items.map((i) => i.text)).toEqual(['The deck was shuffled.', 'Met: 1']);
    render(<HandledList items={items} />);
    expect(screen.getByTestId('handled')).toHaveTextContent('Handled for you');
  });
});

describe('start anywhere', () => {
  const steps = [s1, s2, { kind: 'epilogue', id: 'e' } as Step];
  const form = [{ id: 'q1', field: 'met' }, { id: 'q2', field: 'xp', who: 'p1', min: 0, max: 20 }, { id: 'q3', field: 'allies', options: ['Ann', 'Bo'] }];
  it('marks earlier steps played and fills the log from the answers', () => {
    const save = startAt({ id: 'c', version: '1', steps, at: steps[2] as Step, fields, form, answers: { q1: true, q2: 7, q3: ['Bo'] }, seed: 3 });
    expect(save.position.done).toEqual(['scenario:a', 'scenario:b']);
    expect(save.position.step).toEqual(steps[2]);
    expect(save.log.recorded).toEqual(['met']);
    expect(save.log.counts['p1/xp']).toBe(7);
    expect(save.log.sets['allies']?.entries).toEqual(['Bo']);
    expect(linear(steps)(save)).toEqual(steps[2]);
    expect(() => startAt({ id: 'c', version: '1', steps, at: { kind: 'scenario', id: 'zz' }, fields, form, answers: {}, seed: 1 })).toThrow();
  });
  it('renders the form from data', () => {
    function T() {
      const [a, setA] = useState<Record<string, StartAnswer | undefined>>({});
      return <><StartForm form={form} answers={a} onChange={(id, v) => setA({ ...a, [id]: v })} /><output data-testid="o">{JSON.stringify(a)}</output></>;
    }
    render(<T />);
    fireEvent.click(screen.getByLabelText('q1'));
    fireEvent.click(screen.getByLabelText('Ann'));
    expect(screen.getByTestId('o')).toHaveTextContent('{"q1":true,"q3":["Ann"]}');
  });
});

describe('extra tab', () => {
  it('shows the games tab content (an achievements list) when chosen', () => {
    render(<LogTabs sections={[]} tabs={[{ id: 'ach', label: 'Achievements', content: <p data-testid="ach-list">list</p> }]} />);
    expect(screen.queryByTestId('ach-list')).toBeNull();
    fireEvent.click(screen.getByTestId('tab-ach'));
    expect(screen.getByTestId('ach-list')).toBeInTheDocument();
  });
});
