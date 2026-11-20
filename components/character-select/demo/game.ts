// A made-up game for the demo and the tests: names, texts and shapes invented here.
import type { Character, CharacterSet, DeckCard, Mode, Opponent, OptionField } from '../model.ts';

const face = (hue: number, shape: number): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><rect width="100" height="120" fill="hsl(${String(hue)},30%,30%)"/>` +
      `<path d="M10 120 Q50 70 90 120Z" fill="hsl(${String(hue)},45%,55%)"/>` +
      (shape % 3 === 0
        ? `<circle cx="50" cy="45" r="22" fill="hsl(${String(hue + 40)},50%,72%)"/>`
        : shape % 3 === 1
          ? `<rect x="29" y="24" width="42" height="44" rx="8" fill="hsl(${String(hue + 40)},50%,72%)"/>`
          : `<path d="M50 20 L74 66 L26 66Z" fill="hsl(${String(hue + 40)},50%,72%)"/>`) +
      `</svg>`,
  )}`;

const KINDS = ['TOOL', 'FRIEND', 'PLACE', 'EVENT'];
const deck = (who: string, n: number): DeckCard[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${who}-${String(i)}`,
    name: `${['Lantern', 'Rope', 'Old Map', 'Owl', 'Ferry', 'Mill', 'Storm', 'Market', 'Kettle', 'Bridge'][i % 10] ?? ''} ${String(i + 1)}`,
    kind: KINDS[i % (i < 8 ? 4 : 3)] ?? 'TOOL',
  }));

export const sets: CharacterSet[] = [
  { id: 'core', label: 'Core box' },
  { id: 'hills', label: 'Into the Hills' },
];

const people: [string, string, string, number, number][] = [
  ['ada', 'Ada Quill', 'core', 1, 200],
  ['bram', 'Bram Holt', 'core', 3, 20],
  ['cora', 'Cora Wend', 'core', 4, 120],
  ['dov', 'Dov Marsh', 'core', 6, 300],
  ['esk', 'Esk Fallow', 'hills', 2, 80],
  ['fen', 'Fen Rook', 'hills', 5, 160],
  ['gale', 'Gale Ashby', 'hills', 8, 260],
];

export const roster: Character[] = people.map(([id, name, set, stat, hue], i) => ({
  id,
  name,
  short: name.split(' ')[1],
  set,
  stat,
  statLine: `Difficulty ${String(stat)} / 10`,
  meta: `${sets.find((s) => s.id === set)?.label ?? ''} · hand size ${String(4 + (i % 2))}`,
  summary: `A patient traveller who gains [coin] from every <FRIEND> met on the road. Keep the Old Map close and the Lantern lit.`,
  full: `The full text of ${name}.\nGains one [coin] each time a <FRIEND> card enters play. Starts with the Old Map in hand and may look at the top card of the road deck once per round.`,
  links: [{ phrase: 'Old Map', id: `${id}-2` }],
  portrait: { src: face(hue, i), focus: { x: 0.5, y: 0.35 } },
  deck: deck(id, 14 + i),
}));

export const opponents: Opponent[] = people.map(([id, name, set, stat, hue], i) => ({
  id,
  name: `${name.split(' ')[1] ?? name} rival`,
  set,
  stat,
  statLine: `${String(stat)}/10`,
  meta: `${sets.find((s) => s.id === set)?.label ?? ''} · difficulty ${String(stat)} / 10`,
  summary: 'Takes the cheapest card in the market each round and races to the far side of the river.',
  full: 'Full rival rules: on its turn it takes the cheapest card; on a tie, the leftmost. It never trades.',
  portrait: { src: face(hue, i + 1) },
}));

export const modes: Mode[] = [
  { id: 'versus', label: 'Versus a rival', line: 'Your traveller against a rival of your choice.' },
  { id: 'practice', label: 'Practice', line: 'No rival in this mode.', opponents: false, note: 'Practice alone for ten rounds.' },
];

export const fields: OptionField[] = [
  {
    id: 'difficulty',
    label: 'Difficulty',
    kind: 'select',
    modes: ['versus'],
    choices: [
      { value: 'easy', label: 'Easy' },
      { value: 'normal', label: 'Normal' },
      { value: 'hard', label: 'Hard', disabled: 'not ready' },
    ],
  },
  { id: 'pack', label: 'Market cards', kind: 'select', choices: [{ value: 'core', label: 'Core box' }, { value: 'all', label: 'All boxes' }] },
  { id: 'extra', label: 'Add the hills pack', kind: 'check' },
  { id: 'seed', label: 'Seed (optional)', kind: 'text' },
];

export const kindOrder = KINDS;
export const icons = ['coin'];
