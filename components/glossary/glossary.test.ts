import { describe, expect, it } from 'vitest';
import {
  buildIndex,
  checkGlossary,
  coveredChars,
  glossaryProblems,
  iconEntry,
  linkedIds,
  matchText,
  paragraphs,
  runGlossaryCheck,
  searchEntries,
  besideAnchor,
  type GlossaryEntry,
} from './index.ts';

// a tiny fake game
const E: GlossaryEntry[] = [
  { id: 'laser', term: 'laser', summary: 'A laser.', rules: ['R-1'] },
  { id: 'laser-token', term: 'laser token', aliases: ['Laser #'], icon: 'laser-token:*', summary: 'A token.' },
  { id: 'stun', term: 'stun', summary: 'Stun.' },
  { id: 'turn', term: 'turn', summary: 'A turn.' },
  { id: 'enemy', term: 'enemy', aliases: ['enemies'], summary: 'A foe.', see: ['stun'] },
  { id: 'protected', term: 'PROTECTED', summary: 'Heading.' },
  { id: 'side', term: 'Anomaly 3 (side B)', summary: 'A side.' },
  { id: 'strength', term: 'strength', tokens: ['str #'], summary: 'Number token.' },
  { id: 'card', term: 'card', searchAliases: ['deck'], summary: 'A card.' },
  { id: 'play', term: 'play', aliases: ['PLAY'], plain: true, summary: 'Plain word.' },
];
const index = buildIndex(E);

describe('matcher', () => {
  it('takes the longest name, endings and word boundaries', () => {
    expect(linkedIds(index, 'Discard laser tokens from each enemy.')).toEqual(['laser-token', 'enemy']);
    expect(linkedIds(index, 'If stunned, two lasers hit enemies.')).toEqual(['stun', 'laser', 'enemy']);
    expect(linkedIds(index, 'Return them.')).toEqual([]);
    expect(linkedIds(index, 'Drew Anomaly 3 (side B).')).toEqual(['side']);
  });

  it('matches names in capitals only as written, others in any case', () => {
    expect(linkedIds(index, 'PROTECTED: no.')).toEqual(['protected']);
    expect(linkedIds(index, 'Protected: no.')).toEqual([]);
    expect(linkedIds(index, 'Stun the Enemy.')).toEqual(['stun', 'enemy']);
  });

  it('resolves {code} and [[code]], wildcards and number tokens', () => {
    const segs = matchText(index, 'a {laser-token:2} and [[str 3]] and [[nope]]');
    expect(segs.filter((s) => s.kind === 'icon').map((s) => (s.kind === 'icon' ? s.id : ''))).toEqual(['laser-token', 'strength', null]);
    expect(iconEntry(index, 'STR 12')).toBe('strength');
    expect(iconEntry(index, 'str x')).toBeNull();
  });

  it('takes the game icon markup', () => {
    const own = buildIndex(E, { icon: /<([a-z:0-9-]+)>/ });
    expect(linkedIds(own, 'a <laser-token:1> b [[str 3]]')).toEqual(['laser-token']);
  });

  it('linking index leaves out search aliases and plain names; coverage keeps them', () => {
    expect(linkedIds(index, 'play two decks, PLAY')).toEqual(['play']);
    const cover = buildIndex(E, { coverage: true });
    expect(linkedIds(cover, 'play two decks')).toEqual(['play', 'card']);
  });

  it('covered characters, paragraphs, search', () => {
    expect(coveredChars(index, 'a stun').map(Number).join('')).toBe('001111');
    expect(paragraphs('one\n\n two \n\n')).toEqual(['one', 'two']);
    expect(searchEntries(E, 'deck').map((e) => e.id)).toEqual(['card']);
    expect(searchEntries(E, 'la to').map((e) => e.id)).toEqual(['laser-token']);
    expect(searchEntries(E, '')).toHaveLength(E.length);
  });

  it('memo returns the same segments', () => {
    expect(matchText(index, 'stun')).toBe(matchText(index, 'stun'));
  });

  it('problems: ids, duplicates, see', () => {
    expect(glossaryProblems(E)).toEqual([]);
    expect(
      glossaryProblems([
        { id: 'Bad', term: 'x', summary: '' },
        { id: 'a', term: 'X', summary: 's', see: ['a', 'zz'] },
        { id: 'a', term: 'x', summary: 's' },
      ]),
    ).toEqual([
      'Bad: the id is not lowercase words joined by hyphens',
      'Bad: empty summary',
      '"X" names both Bad and a',
      'duplicate id a',
      'a: see "zz" is not an entry',
      'a: sees itself',
    ]);
  });

  it('places a popover beside the anchor, on screen', () => {
    const screen = { width: 1000, height: 800 };
    expect(besideAnchor({ left: 10, right: 50, top: 100, bottom: 120 }, { width: 300, height: 200 }, screen)).toEqual({ left: 62, top: 100 });
    expect(besideAnchor({ left: 900, right: 950, top: 700, bottom: 720 }, { width: 300, height: 200 }, screen)).toEqual({ left: 588, top: 588 });
    const a = { left: 10, right: 50, top: 100, bottom: 120 };
    const size = { width: 300, height: 200 };
    expect(besideAnchor(a, size, screen, 12, { prefer: ['left', 'right'] })).toEqual({ left: 62, top: 100 });
    const wide = { left: 400, right: 450, top: 100, bottom: 120 };
    expect(besideAnchor(wide, size, screen, 12, { prefer: ['left', 'right'] })).toEqual({ left: 88, top: 100 });
    const box = { left: 460, right: 800, top: 0, bottom: 500 };
    expect(besideAnchor(wide, size, screen, 12, { avoid: [box] })).toEqual({ left: 88, top: 100 });
    const all = [box, { left: 0, right: 440, top: 0, bottom: 500 }];
    expect(besideAnchor(wide, size, screen, 12, { avoid: all })).toEqual({ left: 462, top: 100 });
  });
});

describe('check', () => {
  const texts = [
    { where: 'card A', text: 'Stun each enemy. PROTECTED.' },
    { where: 'describe', text: 'Gain a laser token.', generated: true },
  ];

  it('passes when every word and icon has an entry', () => {
    const lines: string[] = [];
    const input = { entries: E, texts, iconCodes: ['laser-token:3'], required: ['laser token', 'turn'], vocab: ['enem(?:y|ies)', 'cards?'], headings: true, ruleIds: ['R-1'] };
    expect(checkGlossary(input)).toEqual([]);
    expect(runGlossaryCheck(input, { out: (l) => lines.push(l) })).toBe(0);
    expect(lines).toEqual(['glossary:check: 10 entries cover 2 texts']);
  });

  it('fails on an unexplained term or icon, each check', () => {
    const findings = checkGlossary({
      entries: [...E, { id: 'x', term: 'x', summary: 's', rules: ['R-9'] }],
      texts: [
        { where: 'card B', text: 'Destroy a {shield:1}. SANDS OF TIME. Draw decks.' },
        { where: 'describe', text: 'Nothing here.', generated: true },
        { where: 'describe', text: '(no effect)', generated: true },
      ],
      iconCodes: ['hull'],
      required: ['laser tokens and more'],
      vocab: ['destroy', 'decks?'],
      headings: true,
      ruleIds: ['R-1'],
      nothingToLink: (t) => t === '(no effect)',
    });
    expect(findings).toEqual([
      { check: 'RULE', what: 'x cites R-9, which the game does not define' },
      { check: 'ICON', what: '{hull} (icon set) has no entry' },
      { check: 'ICON', what: '{shield:1} (first in card B) has no entry' },
      { check: 'REQUIRED', what: '"laser tokens and more" has no entry of its own' },
      { check: 'HEADING', what: '"SANDS OF TIME" (first in card B) is not a link' },
      { check: 'VOCAB', what: '"destroy" (first in card B) is a game word with no entry' },
      { check: 'LANGUAGE', what: 'describe: "Nothing here." links no entry' },
    ]);
    const err: string[] = [];
    expect(runGlossaryCheck({ entries: [E[0]!, E[0]!], texts: [] }, { err: (l) => err.push(l) })).toBe(1);
    expect(err).toEqual(['SCHEMA duplicate id laser', 'glossary:check: 1 finding(s)']);
  });
});
