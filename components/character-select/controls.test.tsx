// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
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
  for (const k of ['begin', 'card', 'deck-tab', 'entry', 'mode', 'more', 'next', 'opponent-pick', 'options-toggle', 'prev', 'search', 'field-select', 'link', 'field-check', 'field-text'])
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

it('K470 control: the props work (on, disabled, expanded, onChange change the screen)', () => {
  const now = new Map<string, ControlProps>();
  const get = (k: string): ControlProps => {
    const p = now.get(k);
    if (p === undefined) throw new Error(`no ${k}`);
    return p;
  };
  const onBegin = draw({
    slots: {
      control: (kind, p) => {
        now.set(`${kind}:${p.id ?? ''}`, p);
        return null;
      },
    },
  });
  const fire = (k: string, f: (p: ControlProps) => void): void => {
    act(() => {
      f(get(k));
    });
  };
  expect(get('entry:ada').on).toBe(true);
  expect(get('entry:cora').on).toBe(false);
  fire('entry:cora', (p) => p.onClick?.());
  expect(one('hero').dataset.id).toBe('cora');
  expect(get('entry:cora').on).toBe(true);
  expect(get('entry:ada').on).toBe(false);
  const tab = part('tab')[1]?.dataset.kind ?? '';
  expect(get(`deck-tab:${tab}`).on).toBe(false);
  fire(`deck-tab:${tab}`, (p) => p.onClick?.());
  expect(get(`deck-tab:${tab}`).on).toBe(true);
  expect(get('deck-tab:ALL').on).toBe(false);
  expect(part('card').length).toBeGreaterThan(0);
  expect(part('card').every((c) => c.dataset.kind === tab)).toBe(true);
  const m1 = modes[1]?.id ?? '';
  expect(get(`mode:${m1}`).on).toBe(false);
  fire(`mode:${m1}`, (p) => p.onClick?.());
  expect(get(`mode:${m1}`).on).toBe(true);
  expect(get(`mode:${modes[0]?.id ?? ''}`).on).toBe(false);
  expect(one('character-select').dataset.mode).toBe(m1);
  fire('deck-tab:ALL', (p) => p.onClick?.());
  expect(get('prev:').disabled).toBe(true);
  expect(get('next:').disabled).toBe(false);
  fire('next:', (p) => p.onClick?.());
  expect(get('prev:').disabled).toBe(false);
  expect(one('prev').hasAttribute('disabled')).toBe(false);
  fire('search:', (p) => p.onChange?.('Rope'));
  expect(part('card').length).toBeGreaterThan(0);
  expect(part('card').every((c) => c.title.includes('Rope'))).toBe(true);
  expect(get('search:').value).toBe('Rope');
  expect(get('options-toggle:').expanded).toBe(false);
  fire('options-toggle:', (p) => p.onClick?.());
  expect(get('options-toggle:').expanded).toBe(true);
  expect(part('options')).toHaveLength(1);
  fire('field-check:extra', (p) => p.onChange?.(true));
  expect(get('field-check:extra').value).toBe(true);
  fire('field-select:pack', (p) => p.onChange?.('all'));
  expect(get('field-select:pack').value).toBe('all');
  fire('field-text:seed', (p) => p.onChange?.('abc'));
  expect(get('field-text:seed').value).toBe('abc');
  fireEvent.click(one('begin'));
  const o = (onBegin.mock.calls[0]?.[0] as { options: Record<string, unknown> }).options;
  expect(o.extra).toBe(true);
  expect(o.pack).toBe('all');
  expect(o.seed).toBe('abc');
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
