import { existsSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ENGINE_WORDS, promptLogOf, promptLogs, readScreenLogs, Scenario, screenMain, screenProblems, type ScreenInput, type ScreenPrompt } from './index.ts';
import { cardCase } from './cardCase.ts';
import { recordCardPrompts } from './promptRecorder.ts';
import { clearPromptLog } from './clearLog.ts';
import { DICE_GAME } from './fake/dice.ts';

// clearLog.ts (imported above) clears this test file's own log before it runs: a stale one is written here, at collection.
const own = promptLogOf(fileURLToPath(import.meta.url));
mkdirSync(dirname(own), { recursive: true });
writeFileSync(own, '{"t":"opened","clause":"stale#1"}\n');
afterAll(() => { rmSync(own, { force: true }); for (const d of [dirname(own), dirname(dirname(own))]) try { rmdirSync(d); } catch { /* not empty */ } });

// Made-up clauses: an amount, two shared costs, a plain line, a choice of two lines.
const clauses = [
  { id: 'a#1', text: 'Deal 2 damage to a foe.' },
  { id: 'b#1', text: 'Pay 3 coins per player.' },
  { id: 'c#1', text: 'Split 4 coins between the players.' },
  { id: 'd#1', text: 'Swap two cards.' },
  { id: 'e#1', text: 'Gain 2 health.' },
  { id: 'e#2', text: 'Draw a card.' },
];
const ok: ScreenPrompt = { clause: 'a#1', line: 'Deal 2 damage to a foe.', shown: 'Deal 2 damage to a foe. Choose a foe.' };
const scan = (prompts: ScreenPrompt[], more: Partial<ScreenInput> = {}): string[] =>
  screenProblems({ faces: [], zoom: (x) => x, icons: {}, clauses, prompts, opened: [], ...more });
const whoPays = { shared: [/\bper player\b/i, /\bsplit\b/i], says: [/\bYou pay\b/, /\bP\d pays\b/] };
const ruleIds = [/\b[A-Z]{2,}-\d+\b/];

describe('K668 prompt rules in the screen scan', () => {
  it('K668 rule 1: a prompt quoting its whole clause passes; a part fails', () => {
    expect(scan([ok])).toEqual([]);
    expect(scan([{ ...ok, line: 'Deal 2 damage' }])).toEqual(['prompt for a#1: does not quote its printed clause']);
    expect(scan([{ ...ok, line: 'Deal 2 damage to a foe. Swap two cards.' }])).toEqual(['prompt for a#1: does not quote its printed clause']);
  });
  it('K668 rule 1: the shown words must hold the clause whole too', () => {
    expect(scan([{ ...ok, shown: 'Deal 2' }])).toEqual(['prompt for a#1: does not quote its printed clause']);
  });
  it('K668 rule 1: with quote on, a prompt without line fails', () => {
    expect(scan([{ clause: 'a#1', shown: 'Deal 2 damage to a foe.' }], { quote: true })).toEqual(['prompt for a#1: does not quote its printed clause']);
    expect(scan([ok], { quote: true })).toEqual([]);
  });
  it('K668 rule 1 poor: a prompt without line is not quote-checked', () => {
    expect(scan([{ clause: 'a#1', shown: 'Deal 2?' }])).toEqual([]);
  });
  it('K668 rule 2: every shared cost names who pays, from the game patterns', () => {
    const b: ScreenPrompt = { clause: 'b#1', shown: 'Pay 3 coins per player.', screenOptions: ['3 and 3'] };
    const c: ScreenPrompt = { clause: 'c#1', shown: 'Split 4 coins.', screenOptions: ['2 and 2'] };
    expect(scan([b, c], { whoPays })).toEqual(['prompt for b#1: does not say who pays', 'prompt for c#1: does not say who pays']);
    expect(scan([{ ...b, screenOptions: ['You pay 3, P2 pays 3'] }, { ...c, shown: 'Split 4 coins: P1 pays 2' }], { whoPays })).toEqual([]);
    expect(scan([{ ...b, shown: 'Pay 3 coins per player, you choose.' }], { whoPays })).toEqual(['prompt for b#1: does not say who pays']);
  });
  it('K668 rule 2: a prompt with payers names each of them', () => {
    expect(scan([{ ...ok, payers: ['P1', 'P2'], shown: 'Deal 2 damage to a foe. P1 pays 1' }], { whoPays })).toEqual(['prompt for a#1: does not say who pays']);
    expect(scan([{ ...ok, payers: ['P1', 'P2'], shown: 'Deal 2 damage to a foe. P1 pays 1, P2 pays 1' }], { whoPays })).toEqual([]);
  });
  it('K668 rule 2: a who-pays pattern that accepts a bare "you" fails', () => {
    expect(scan([ok], { whoPays: { ...whoPays, says: [/\byou\b/i] } })).toEqual(['whoPays: pattern /\\byou\\b/i accepts a bare "you"']);
    expect(scan([ok], { whoPays: { ...whoPays, says: [/\byou /i] } })).toEqual(['whoPays: pattern /\\byou /i accepts a bare "you"']);
    expect(scan([ok], { whoPays: { ...whoPays, says: [/you/] } })).toEqual(['whoPays: pattern /you/ accepts a bare "you"']);
  });
  it('K668 rule 2 poor: without whoPays nothing changes', () => {
    expect(scan([{ clause: 'b#1', shown: 'Pay 3 coins per player.' }])).toEqual([]);
  });
  it('K668 rule 3: a rule id in the raw text fails, engine words too', () => {
    expect(scan([{ ...ok, raw: `${ok.shown} (DMG-03)` }], { ruleIds })).toEqual(['prompt for a#1: rule id in the prompt text']);
    expect(scan([{ ...ok, screenOptions: ['F1 (RUL-12)'] }], { ruleIds })).toEqual(['prompt for a#1: rule id in the prompt text']);
    expect(scan([{ ...ok, raw: '[custom swap] Choose a foe.' }], { ruleIds })).toEqual(['prompt for a#1: rule id in the prompt text']);
    expect(scan([{ ...ok, raw: 'Engine: choose a foe.' }], { ruleIds })).toEqual(['prompt for a#1: rule id in the prompt text']);
    expect(scan([{ ...ok, raw: 'XR-7 Robot: Deal 2 damage.' }], { ruleIds, names: ['XR-7 Robot'] })).toEqual([]);
    expect(scan([{ ...ok, raw: 'XR-8 Robot: Deal 2 damage.' }], { ruleIds, names: ['XR-7 Robot'] })).toEqual(['prompt for a#1: rule id in the prompt text']);
    expect(ENGINE_WORDS.length).toBeGreaterThan(1);
    expect(scan([{ ...ok, raw: 'engine: choose a foe.' }], { ruleIds })).toEqual(['prompt for a#1: rule id in the prompt text']);
    expect(scan([{ ...ok, raw: ok.shown, screenOptions: ['F1 (RUL-12)'] }], { ruleIds })).toEqual(['prompt for a#1: rule id in the prompt text']);
    expect(scan([{ ...ok, raw: ok.shown, engineOptions: ['F1 (RUL-12)'] }], { ruleIds })).toEqual(['prompt for a#1: rule id in the prompt text']);
    expect(scan([{ ...ok, raw: ok.shown, screenOptions: ['F1'] }], { ruleIds })).toEqual([]);
  });
  it('K668 rule 3 poor: without ruleIds nothing changes', () => {
    expect(scan([{ ...ok, raw: 'Engine: (DMG-03)' }])).toEqual([]);
  });
  it('K668 rule 4: a handler sentence equals its printed clause', () => {
    expect(scan([ok], { handlers: [{ id: 'swap', clause: 'd#1', text: 'Swap two cards.' }] })).toEqual([]);
    expect(scan([ok], { handlers: [{ id: 'swap', clause: 'd#1', text: 'Swap 2 cards.' }] })).toEqual(['prompt for d#1: handler swap text is not its printed clause']);
    expect(scan([ok], { handlers: [{ id: 'swap', clause: 'z#9', text: 'Swap two cards.' }] })).toEqual(['handler swap: unknown clause z#9']);
  });
  it('K668 rule 5: a prompt is credited by its record path', () => {
    const records = [{ card: 'e', clause: 'e#1', path: 'play.0' }, { card: 'e', clause: 'e#2', path: 'play.1' }];
    const p: ScreenPrompt = { clause: 'e#2', card: 'e', path: 'play.0.1', line: 'Gain 2 health.', shown: 'Gain health?' };
    expect(scan([p], { records })).toEqual(['prompt for e#1: no amount', 'prompt for e#1: does not quote its printed clause']);
    expect(scan([{ ...p, path: 'play.1' }], { records })).toEqual(['prompt for e#2: does not quote its printed clause']);
    expect(scan([{ ...p, path: 'play.9' }], { records })).toEqual(['prompt for e#2: does not quote its printed clause']);
    expect(scan([{ ...p, card: 'x' }], { records })).toEqual(['prompt for e#2: does not quote its printed clause']);
  });
  it('K668 rule 6: a choice of lines is checked per option', () => {
    const records = [{ clause: 'e#1', path: 'play.0' }, { clause: 'e#2', path: 'play.1' }];
    const p: ScreenPrompt = { clause: 'e#2', line: 'Gain 2 health. Draw a card.', shown: 'Gain 2 health. Draw a card. Choose the next effect.', choices: [{ label: 'Gain 2 health', path: 'play.0' }, { label: 'Draw a card', path: 'play.1' }] };
    expect(scan([p], { records })).toEqual([]);
    expect(scan([{ ...p, choices: [{ label: 'Gain health', path: 'play.0' }, { label: 'Draw a card (DRW-01)', path: 'play.1' }] }], { records, ruleIds })).toEqual(['prompt for e#1: no amount', 'prompt for e#2: rule id in the prompt text']);
    expect(scan([{ ...p, line: 'Gain 2 health.' }], { records })).toEqual(['prompt for e#2: does not quote its printed clause']);
    expect(scan([{ ...p, choices: [{ label: 'Gain 2', path: 'play.9' }] }], { records })).toEqual(['prompt for e#2: option "Gain 2" is no clause\'s']);
    expect(scan([{ ...p, choices: [{ label: 'Gain 2', clause: 'e#1' }] }])).toEqual([]);
    expect(scan([{ ...p, shown: 'Choose the next effect.' }], { records })).toEqual(['prompt for e#1: does not quote its printed clause', 'prompt for e#2: does not quote its printed clause']);
  });
  it('K668 rule 6: the choice prompt itself is checked as well as each option', () => {
    const records = [{ clause: 'e#1', path: 'play.0' }, { clause: 'e#2', path: 'play.1' }];
    const p: ScreenPrompt = { clause: 'e#2', shown: 'Gain 2 health. Draw a card. Choose the next effect.', choices: [{ label: 'Gain 2 health', path: 'play.0' }] };
    expect(scan([{ ...p, shown: `${p.shown} (NXT-01)` }], { records, ruleIds })).toEqual(['prompt for e#2: rule id in the prompt text']);
    expect(scan([{ ...p, screenOptions: ['Gain 2 health (NXT-01)'] }], { records, ruleIds })).toEqual(['prompt for e#2: rule id in the prompt text']);
    expect(scan([{ ...p, engineOptions: ['NXT-01'] }], { records, ruleIds })).toEqual(['prompt for e#2: rule id in the prompt text']);
    expect(scan([{ ...p, payers: ['P1'] }], { records, whoPays })).toEqual(['prompt for e#2: does not say who pays', 'prompt for e#1: does not say who pays']);
    expect(scan([{ ...p, payers: ['P1'], shown: `${p.shown} P1 pays.` }], { records, whoPays })).toEqual(['prompt for e#1: does not say who pays']);
  });
  it('K668 rule 7: an empty log or an unknown clause id fails', () => {
    expect(scan([], { strictLog: true })).toEqual(['no prompts recorded: run the card tests first', 'no opened clauses recorded: run the card tests first']);
    expect(scan([{ clause: 'q#1', shown: 'Hi' }], { strictLog: true, opened: ['a#1', 'r#1'] })).toEqual(['logged clause q#1 is in no clause', 'logged clause r#1 is in no clause', 'a#1 opens a prompt no test scanned', 'r#1 opens a prompt no test scanned']);
    expect(scan([ok], { strictLog: true, opened: ['a#1'] })).toEqual([]);
    const log: string[] = [], base: ScreenInput = { faces: [], zoom: (x) => x, icons: {}, clauses, prompts: [], opened: [] };
    expect(screenMain({ ...base, strictLog: true }, (l) => log.push(l))).toBe(1);
    expect(screenMain(base, (l) => log.push(l))).toBe(0);
    expect(log).toEqual(['no prompts recorded: run the card tests first', 'no opened clauses recorded: run the card tests first', 'cards:screen ok']);
  });
  it('K668 rule 7 poor: without strictLog an empty log passes', () => {
    expect(scan([])).toEqual([]);
  });
});

// The recorder: a card test's prompts feed the scan.
const dir = mkdtempSync(join(tmpdir(), 'k668-'));
const file = join(dir, 'prompts.jsonl');
const stop = recordCardPrompts({ file, entry: () => ({ line: 'Score 3, then discard a card.', shown: 'Score 3, then discard a card. Choose a card.' }) });
afterAll(stop);
const play = (): void => {
  const sc = new Scenario(DICE_GAME).set((s) => void (s.dice = [1, 2, 3]));
  const [l] = sc.put('hand', 'ladder', 'twin', 'plain');
  sc.run({ kind: 'play', card: l as string });
  expect(sc.prompt).not.toBeNull();
};
describe('K668 prompt recorder', () => {
  it("K668 clearLog clears this test file's own log before it runs", () => {
    expect(existsSync(own)).toBe(false);
    expect(own.endsWith('k668.test.ts.jsonl')).toBe(true);
    const d = mkdtempSync(join(tmpdir(), 'k668-logs-'));
    writeFileSync(join(d, 'b.jsonl'), ''); writeFileSync(join(d, 'a.jsonl'), ''); writeFileSync(join(d, 'x.txt'), '');
    expect(promptLogs(d)).toEqual([join(d, 'a.jsonl'), join(d, 'b.jsonl')]);
  });
  it('K668 clearPromptLog empties the log', () => {
    clearPromptLog(file);
    expect(existsSync(file)).toBe(false);
  });
  it('not a card case: its prompt is not recorded', play);
  cardCase({ clause: 'ladder#1', printed: 'Score 3, then discard a card.', ar: 'AR-1' }, play);
  it('K668 the recorded card test feeds the scan', () => {
    const log = readScreenLogs([file]);
    expect(log.prompts).toEqual([{ clause: 'ladder#1', line: 'Score 3, then discard a card.', shown: 'Score 3, then discard a card. Choose a card.' }]);
    const input: ScreenInput = { faces: [], zoom: (x) => x, icons: {}, clauses: [{ id: 'ladder#1', text: 'Score 3, then discard a card.' }], ...log, strictLog: true };
    expect(screenProblems(input)).toEqual([]);
    expect(screenProblems({ ...input, clauses: [{ id: 'ladder#1', text: 'Score 4, then discard a card.' }] })).toEqual(['prompt for ladder#1: no amount', 'prompt for ladder#1: does not quote its printed clause']);
  });
  cardCase({ clause: 'ladder#2', printed: 'Score 3, then discard a card.', ar: 'AR-1' }, () => { play(); play(); });
  it('K668 two scenarios in one card test both record their prompt', () => {
    expect(readScreenLogs([file]).prompts.filter((p) => p.clause === 'ladder#2')).toHaveLength(2);
  });
});

describe('K668 README recipes', () => {
  it('K668 recipe: the prompt rules on a recorded prompt', () => {
    const prompts: ScreenPrompt[] = [{ clause: 'b#1', line: 'Pay 3 coins per player.', shown: 'Pay 3 coins per player.', raw: 'Pay 3 coins per player. (PAY-02)' }];
    const whoPays = { shared: [/\bper player\b/i], says: [/\bYou pay\b/, /\bP\d pays\b/] };
    const found = screenProblems({ faces: [], zoom: (t) => t, icons: {}, clauses: [{ id: 'b#1', text: 'Pay 3 coins per player.' }], prompts, opened: ['b#1'], strictLog: true, whoPays, ruleIds: [/\b[A-Z]{2,}-\d+\b/] });
    expect(found).toEqual(['prompt for b#1: does not say who pays', 'prompt for b#1: rule id in the prompt text']);
  });
  it('K668 recipe: record every card test', () => {
    const before = Scenario.onPrompt;
    const undo = recordCardPrompts({ entry: (p) => ({ shown: String((p as { text?: string }).text) }) });
    expect(Scenario.onPrompt).toBeTypeOf('function');
    expect(Scenario.onPrompt).not.toBe(before);
    undo();
    expect(Scenario.onPrompt).toBe(before);
    expect(before).toBeTypeOf('function');
  });
});
