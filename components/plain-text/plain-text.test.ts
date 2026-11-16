import { describe, expect, it } from 'vitest';
import { forbiddenText, plainPrompt, plainView, ruleIdFilter, ruleIdSource, visibleText } from './index';

// A fake game's id families.
const f = ruleIdFilter({
  long: ['TURN', 'GEN', 'TERM', 'CYC', 'BUY', 'BUILD', 'SET-OPT', 'SET', 'CLEAN', 'ROUND', 'GROW', 'INF', 'REST', 'RED', 'CAP', 'STR', String.raw`MAP-(?:AB|CD)`],
  short: ['IR', 'AR', 'RL', 'R', 'A', 'D', 'E', 'F'],
});

describe('strip', () => {
  const cases: [string, string][] = [
    ['Idle Scout (TURN-06, TURN-09).', 'Idle Scout.'],
    ['replaced in Upkeep (TERM-10, CYC-01 to CYC-04).', 'replaced in Upkeep.'],
    ['BUILD-01 to BUILD-10.', ''],
    ['SET-01 to SET-05, CLEAN-08, ROUND-03.', ''],
    ['When Grown (GROW-02), When Swayed (INF-03), Idle Scout (REST-01).', 'When Grown, When Swayed, Idle Scout.'],
    ['gain 1 Zed instead (BUILD-09). Reducing a track: RED-01 to RED-06.', 'gain 1 Zed instead. Reducing a track.'],
    ['the Keep cannot be built over (CAP-01)', 'the Keep cannot be built over'],
    ['Pacts in play at the limit (IR-39, F-06)', 'Pacts in play at the limit'],
    ['no outpost at the scout (never the Keep, CAP-02)', 'no outpost at the scout (never the Keep)'],
    ['Removed a [Salt] token (CLEAN-02).', 'Removed a [Salt] token.'],
    ['Pay/Spend (TERM-01); Gain (TERM-02); Trash (TERM-03, TERM-04)', 'Pay/Spend; Gain; Trash'],
    ['ruled by AR-026 and MAP-CD-02', 'ruled'],
    ['see IR-22.', ''],
    ['Played Wagon, ruled by AR-026.', 'Played Wagon, ruled.'],
    ['ruled by AR-026 here', 'ruled here'],
    ['-2 Zed; return for 4 [Lore] (STR-01 to STR-03).', '-2 Zed; return for 4 [Lore].'],
    ['Draw 2 cards. Gain 1 Coin.', 'Draw 2 cards. Gain 1 Coin.'],
    ['If the deck is empty at Upkeep you lose (RL-013).', 'If the deck is empty at Upkeep you lose.'],
    ['Plan from the deck (R-077). Lose (R-102, RL-013).', 'Plan from the deck. Lose.'],
    ['next to your deck). R-013', 'next to your deck).'],
    ['see RL-029.1 here', 'here'],
    ['Round 2: strength 3 (of 4).', 'Round 2: strength 3 (of 4).'],
    ['Lose (TURN-07A).', 'Lose.'],
    ['Lose (TURN-06,\nTURN-09).', 'Lose.'],
    ['Pay 2.\nR-077\nDraw 1.', 'Pay 2.\nDraw 1.'],
    ['Pay 2 (see\nIR-22).\nDraw 1.', 'Pay 2.\nDraw 1.'],
  ];
  for (const [input, want] of cases) {
    it(JSON.stringify(input), () => {
      expect(f.strip(input)).toBe(want);
    });
  }
  const alike = ['Phase II-3', 'Take A-5 cards', 'T-34', 'X-12 and Y-7', 'Plan B-2', 'AR-5 trucks', 'Pay 1 R-1'];
  const twoDigit = ['COVID-19', 'ECMA-262', 'UTF-16', 'ISO-8859', 'the MIR-22 probe'];
  const prefixed = ['PRE-TURN-07', 'X-AR-026', 'NON-R-48 text', 'xTURN-07'];
  const lowerCase = ['Pay (d-44)', 'bare d-44', 'turn-07'];
  for (const t of [...alike, ...twoDigit, ...prefixed, ...lowerCase]) {
    it(`leaves ${t}`, () => {
      expect(f.strip(t)).toBe(t);
      expect(t).not.toMatch(f.test);
    });
  }
  it('no families: nothing is an id', () => {
    expect(ruleIdSource({})).toBe('(?!)');
    expect(ruleIdFilter({}).strip('see TURN-07.')).toBe('see TURN-07.');
  });
});

describe('plainPrompt, plainView', () => {
  const clean = { id: 'a', label: 'Build', disabled: false };
  const dirty = { id: 'TURN-07', label: 'Build (BUILD-01)', reason: 'at the limit (IR-39, F-06)', why: 'see IR-22.' };
  const prompt = { id: 'p1', ruleId: 'TERM-01', options: [clean, dirty] };
  it('strips labels and reasons, keeps everything else', () => {
    const p = plainPrompt(prompt, f.strip);
    expect(p.options[0]).toBe(clean);
    expect(p.options[1]).toEqual({ id: 'TURN-07', label: 'Build', reason: 'at the limit', why: 'see IR-22.' });
    expect(p.ruleId).toBe('TERM-01');
    expect(plainPrompt(prompt, f.strip, ['why']).options[1]).toEqual({ ...dirty, why: '' });
  });
  it('keeps a label that would be empty', () => {
    const p = plainPrompt({ options: [{ label: 'BUILD-01', reason: 'see IR-22.' }] }, f.strip);
    expect(p.options[0]).toEqual({ label: 'BUILD-01', reason: '' });
  });
  it('gives the same object back when nothing changed', () => {
    const p = { options: [clean, { label: 'BUILD-01' }] };
    expect(plainPrompt(p, f.strip)).toBe(p);
    const v = { prompt: p, turn: 2 };
    expect(plainView(v, f.strip)).toBe(v);
    const none = { prompt: null, turn: 2 };
    expect(plainView(none, f.strip)).toBe(none);
  });
  it('a view gets its prompt cleaned', () => {
    const v = plainView({ prompt, turn: 2 }, f.strip);
    expect(v.turn).toBe(2);
    expect(v.prompt.options.map((o) => o.label)).toEqual(['Build', 'Build']);
    expect(v.prompt.ruleId).toBe('TERM-01');
  });
});

describe('forbiddenText', () => {
  const bad = forbiddenText(f.pattern, String.raw`\bD\d+\b`);
  for (const t of ['chooseCardMode', 'gold = 3', 'see §4.2', 'ruled by D11', 'Pay (BUY-01)', 'ruled by AR-026 here']) {
    it(`catches ${t}`, () => {
      expect(t).toMatch(bad);
    });
  }
  for (const t of ['Draw 2 cards. Gain 1 Coin.', 'Round 2: strength 3 (of 4).', 'McCoy takes A-5 cards', 'COVID-19', 'ECMA-262', 'UTF-16', 'PRE-TURN-07']) {
    it(`passes ${t}`, () => {
      expect(t).not.toMatch(bad);
    });
  }
  it('alone it knows no game ids', () => {
    expect('Pay (BUY-01)').not.toMatch(forbiddenText());
  });
});

describe('visibleText', () => {
  it('reads the text and the title, alt and placeholder attributes, the root element included', () => {
    const node = (attrs: Record<string, string>) => ({ getAttribute: (a: string) => attrs[a] ?? null });
    const el = { textContent: 'Build', ...node({ title: 'root tip' }), querySelectorAll: () => [node({ title: 'at the limit (IR-39)', alt: 'Coin' })] };
    expect(visibleText(el)).toBe('Build\nroot tip\nat the limit (IR-39)\nCoin');
    expect(visibleText(el)).toMatch(f.test);
    expect(visibleText({ textContent: null, querySelectorAll: () => [] })).toBe('');
  });
});
