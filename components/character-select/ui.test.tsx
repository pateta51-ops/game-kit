// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CharacterSelect, type CharacterSelectProps } from './ui.ts';
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

it('roster: grouped by set with labels; the first is picked; a pick changes the hero', () => {
  draw();
  expect(part('set-label').map((e) => e.textContent)).toEqual(['Core box', 'Into the Hills']);
  expect(one('hero').dataset.id).toBe('ada');
  expect(one('first').textContent).toBe('Ada');
  expect(one('last').textContent).toBe('Quill');
  const cora = document.querySelector<HTMLElement>('[data-part="entry"][data-id="cora"]');
  if (cora === null) throw new Error('no cora');
  fireEvent.click(cora);
  expect(one('hero').dataset.id).toBe('cora');
  expect(cora.getAttribute('aria-pressed')).toBe('true');
  expect(one('meter').querySelectorAll('i[data-on="yes"]')).toHaveLength(4);
});

it('canPick disables an entry with its reason', () => {
  draw({ canPick: (id) => ({ ok: id !== 'bram', why: id === 'bram' ? 'Not in your box' : null }) });
  const b = document.querySelector<HTMLButtonElement>('[data-part="entry"][data-id="bram"]');
  expect(b?.disabled).toBe(true);
  expect(b?.title).toBe('Not in your box');
});

it('summary: icons and chips through renderGlyph, a link reports its id, full text on tap', () => {
  const onCard = vi.fn();
  draw({ renderGlyph: (p) => <em>{p.kind}</em>, onCard });
  const s = one('summary', one('hero'));
  expect(one('icon', s).textContent).toBe('icon');
  expect(one('chip', s).dataset.name).toBe('FRIEND');
  fireEvent.click(within(s).getByText('Old Map'));
  expect(onCard).toHaveBeenCalledWith('ada-2');
  expect(part('full', s)).toHaveLength(0);
  fireEvent.click(one('more', s));
  expect(one('full', s).textContent).toContain('The full text of Ada Quill.');
});

it('deck: tabs with counts, a tab filters, search filters, pages move, a new pick starts on All', () => {
  draw();
  const deck = one('deck');
  expect(part('tab', deck).map((t) => `${t.dataset.kind ?? ''}:${t.querySelector('small')?.textContent ?? ''}`)).toEqual([
    'ALL:14',
    'TOOL:4',
    'FRIEND:4',
    'PLACE:4',
    'EVENT:2',
  ]);
  expect(part('card', deck)).toHaveLength(5);
  fireEvent.click(one('next', deck));
  expect(part('pager', deck)[0]?.querySelector('i[data-on="yes"]')).toBe(part('pager', deck)[0]?.querySelectorAll('i')[1]);
  const place = deck.querySelector<HTMLElement>('[data-part="tab"][data-kind="PLACE"]');
  if (place === null) throw new Error('no tab');
  fireEvent.click(place);
  expect(part('card', deck).map((c) => c.dataset.kind)).toEqual(['PLACE', 'PLACE', 'PLACE', 'PLACE']);
  fireEvent.change(one('search', deck), { target: { value: 'zzz' } });
  expect(one('empty', deck).textContent).toBe('No card matches.');
  const bram = document.querySelector<HTMLElement>('[data-part="entry"][data-id="bram"]');
  if (bram === null) throw new Error('no bram');
  fireEvent.click(bram);
  expect(part('card', one('deck'))).toHaveLength(5);
});

it('opponents: the own pick is disabled by default and the first allowed is selected with its detail', () => {
  draw();
  const own = document.querySelector<HTMLButtonElement>('[data-part="opponent-pick"][data-id="ada"]');
  expect(own?.disabled).toBe(true);
  expect(one('opponent').dataset.id).toBe('bram');
  const fen = document.querySelector<HTMLElement>('[data-part="opponent-pick"][data-id="fen"]');
  if (fen === null) throw new Error('no fen');
  fireEvent.click(fen);
  expect(one('opponent-name').textContent).toBe('Rook rival');
});

it('a mode without opponents shows its note and Begin sends no opponent; hidden fields are dropped', () => {
  const onBegin = draw();
  fireEvent.click(screen.getByText('Practice'));
  expect(part('opponent-strip')).toHaveLength(0);
  expect(one('opponent-note').textContent).toBe('Practice alone for ten rounds.');
  fireEvent.click(one('begin'));
  expect(onBegin).toHaveBeenCalledWith({
    mode: 'practice',
    pick: 'ada',
    opponent: null,
    options: { pack: 'core', extra: false, seed: '' },
  });
});

it('options are folded; open, a change reaches Begin', () => {
  const onBegin = draw();
  expect(part('options')).toHaveLength(0);
  fireEvent.click(one('options-toggle'));
  const o = one('options');
  const diff = o.querySelector<HTMLSelectElement>('[data-id="difficulty"] select');
  if (diff === null) throw new Error('no select');
  expect(diff.querySelector<HTMLOptionElement>('option[value="hard"]')?.disabled).toBe(true);
  fireEvent.change(diff, { target: { value: 'normal' } });
  const extra = o.querySelector<HTMLInputElement>('[data-id="extra"] input');
  if (extra === null) throw new Error('no check');
  fireEvent.click(extra);
  fireEvent.click(one('begin'));
  expect(onBegin).toHaveBeenCalledWith({
    mode: 'versus',
    pick: 'ada',
    opponent: 'bram',
    options: { difficulty: 'normal', pack: 'core', extra: true, seed: '' },
  });
});

it('problems disable Begin and show', () => {
  const onBegin = draw({ problems: (c) => (c.pick === 'ada' ? ['Ada is resting.'] : []) });
  expect((one('begin') as HTMLButtonElement).disabled).toBe(true);
  expect(one('problems').textContent).toBe('Ada is resting.');
  fireEvent.click(one('begin'));
  expect(onBegin).not.toHaveBeenCalled();
});

it('slots: frame, header, plate, track and sub-picker render with the current choice', () => {
  draw({
    slots: {
      frame: (s) => <div data-testid="frame">{s}</div>,
      header: <h1>Title</h1>,
      plate: (c, where) => <span data-testid={`plate-${where}`}>{c.name}</span>,
      track: (c, ch) => <span data-testid="track">{`${c.id}/${ch.opponent ?? ''}`}</span>,
      sub: (c) => <span data-testid="sub">{c.id}</span>,
    },
  });
  expect(within(screen.getByTestId('frame')).getByText('Title')).toBeTruthy();
  expect(screen.getAllByTestId('plate-roster')).toHaveLength(7);
  expect(screen.getByTestId('plate-hero').textContent).toBe('Ada Quill');
  expect(screen.getByTestId('plate-opponent').textContent).toBe('Holt rival');
  expect(screen.getByTestId('track').textContent).toBe('ada/bram');
  expect(screen.getByTestId('sub').textContent).toBe('ada');
  expect(part('first')).toHaveLength(0);
});

it('phone: the layout attribute is set, the summary moves below the info and the deck pages by three', () => {
  draw({ phone: true });
  expect(one('character-select').dataset.layout).toBe('phone');
  expect(one('summary').parentElement?.dataset.part).toBe('hero');
  expect(part('card', one('deck'))).toHaveLength(3);
});

it('portrait: cover at the focus point, or a crop of a region', () => {
  draw({
    roster: [
      { id: 'x', name: 'X Y', set: 'core', portrait: { src: 'x.png', focus: { x: 0.2, y: 0.4 } } },
      { id: 'z', name: 'Z W', set: 'core', portrait: { src: 'z.png', crop: { width: 0.5, ratio: 1, bottom: 0.6 } } },
    ],
  });
  const hero = one('portrait', one('hero'));
  expect(hero.style.backgroundSize).toBe('cover');
  expect(hero.style.backgroundPosition).toBe('20% 40%');
  const z = document.querySelector<HTMLElement>('[data-part="entry"][data-id="z"]');
  if (z === null) throw new Error('no z');
  fireEvent.click(z);
  expect(one('portrait', one('hero')).style.backgroundSize).toMatch(/^200(.00)?%/);
});
