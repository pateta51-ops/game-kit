// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CharacterSelect, type CharacterSelectProps, type ControlProps } from './ui.ts';
import { fields, icons, kindOrder, modes, opponents, roster, sets } from './demo/game.ts';

afterEach(cleanup);

const part = (p: string, root: ParentNode = document): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(`[data-part="${p}"]`)];
const one = (p: string, root: ParentNode = document): HTMLElement => {
  const el = root.querySelector<HTMLElement>(`[data-part="${p}"]`);
  if (el === null) throw new Error(`no ${p}`);
  return el;
};
const draw = (more: Partial<CharacterSelectProps> = {}) => {
  const onBegin = vi.fn();
  render(
    <CharacterSelect
      roster={roster}
      sets={sets}
      opponents={opponents}
      modes={modes}
      fields={fields}
      kindOrder={kindOrder}
      icons={icons}
      onBegin={onBegin}
      {...more}
    />,
  );
  return onBegin;
};

it('K470 control: each kind reaches the slot with its props; null keeps the built-in', () => {
  const seen = new Map<string, ControlProps>();
  draw({
    perPage: 1,
    slots: {
      control: (kind, p) => {
        if (!seen.has(kind)) seen.set(kind, p);
        return null;
      },
    },
  });
  fireEvent.click(one('options-toggle'));
  fireEvent.click(one('more', one('hero')));
  for (const k of ['begin', 'card', 'deck-tab', 'entry', 'mode', 'more', 'next', 'opponent-pick', 'options-toggle', 'prev', 'search', 'field-select', 'link'])
    expect(seen.has(k), k).toBe(true);
  expect(seen.get('next')?.label).toBe('Next page');
  expect(seen.get('entry')?.id).toBe('ada');
  expect(seen.get('deck-tab')?.id).toBe('ALL');
  expect(seen.get('field-select')?.choices?.length).toBeGreaterThan(1);
  expect(part('begin')).toHaveLength(1);
  expect(part('mode')).toHaveLength(modes.length);
  expect(part('entry')).toHaveLength(roster.length);
  expect(one('options').querySelectorAll('select')).toHaveLength(2);
});

it('K470 control: a returned part replaces the built-in and its handler works', () => {
  const onBegin = draw({
    slots: {
      control: (kind, p) =>
        kind === 'begin' || kind === 'mode' ? (
          <i data-part={`mine-${kind}`} data-id={p.id} onClick={p.onClick}>
            {p.children}
          </i>
        ) : null,
    },
  });
  expect(part('begin')).toHaveLength(0);
  expect(part('mode')).toHaveLength(0);
  const second = part('mine-mode')[1];
  if (second === undefined) throw new Error('no second mode');
  fireEvent.click(second);
  fireEvent.click(one('mine-begin'));
  expect((onBegin.mock.calls[0]?.[0] as { mode: string }).mode).toBe(modes[1]?.id);
});

it('K470 begin and renderText slots; null keeps the built-ins', () => {
  const onBegin = draw({
    slots: {
      begin: (s, go) => (
        <u data-part="mine-go" onClick={go}>
          {s.label}
        </u>
      ),
      renderText: (t) => <span data-part="mine-text">{t}</span>,
    },
  });
  expect(part('begin')).toHaveLength(0);
  expect(one('mine-text', one('hero')).textContent).toContain('gains');
  fireEvent.click(one('mine-go'));
  expect(onBegin).toHaveBeenCalledTimes(1);
  cleanup();
  draw({ slots: { begin: () => null, renderText: () => null } });
  expect(part('begin')).toHaveLength(1);
  expect(part('mine-text')).toHaveLength(0);
  expect(part('icon', one('hero'))).toHaveLength(1);
});
