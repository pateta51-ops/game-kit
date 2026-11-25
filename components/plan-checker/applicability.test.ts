import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { candidates } from './plancheck.ts';

const script = fileURLToPath(new URL('./plancheck.py', import.meta.url));
const wrapper = fileURLToPath(new URL('./plancheck.ts', import.meta.url));
const python = candidates(process.env, process.platform).find(cmd => spawnSync(cmd[0]!, [...cmd.slice(1), '--version']).status === 0);
if (python === undefined) throw new Error('Python 3 is required for applicability acceptance');
const made: string[] = [];
afterAll(() => made.forEach(dir => rmSync(dir, { recursive: true, force: true })));
const names = JSON.parse(readFileSync(script, 'utf8').match(/SHEET_QUESTIONS = (\[[\s\S]*?\]\])/u)![1]!) as [string, string][];
const sheet = names.map(([id, name]) => `| ${name} | ${['player', 'positions', 'objectives'].includes(id) ? 'One piece reaches the goal' : 'not in this game'} | ${id === 'positions' ? '`grid-map`' : '`engine-core`'} |`).join('\n');
const PLAN = `# Original movement fixture

## 1. Rules

- **MOVE-01** A move enters an adjacent unblocked space.
- **WALL-01** A wall-crossing move is refused without changing state.

## 2. Scenario catalogue

| ID | Rules | Expected |
|---|---|---|
| SC-01 | MOVE-01 | Enter the adjacent open space. |
| SC-02 | WALL-01 | Refuse the wall crossing and preserve the state. |

## 3. Implementation phases

### Phase 1 — movement

SC-01, SC-02. Implement the movement contract and its refusal control.

## 4. Session plan

| Batch | Phases | Model | Confidence | Worker | Touches | Gate | Owner |
|---|---|---|---|---|---|---|---|
| S1 | 1 | test model | 90% | codex | src/engine | npm run check | architect |

## 5. Definition of Done

The declared movement and refusal cases pass. Exercise default-off paths when present.

## 6. Layers

Unit rules, refusal and invariants, then browser acceptance of actual movement.

## 7. Shared preamble

Send every changed flow through e2e with the heavy run queue.

## 8. Reuse map

Kit pin: tag v0.276.1.

| Layer | Kind | Source |
|---|---|---|
| Kernel | Pull | \`engine-core\` |
| Board | Pull | \`grid-map\` |
| Movement policy | New | game code |

| Game sheet line | Answer | Kit part or build-own row |
|---|---|---|
${sheet}

| What the game builds | Words searched in the kit | Nearest kit part | Verdict | Register id or refusal |
|---|---|---|---|---|
| Movement policy | legal movement; wall refusal | \`grid-map\` | game code | The authored fixture owns movement meaning and refusal expectations; steward not asked |
`;
const NONE = { version: 1, cards: { mode: 'none', reason: 'This original movement fixture has no cards.' }, llmPlaytest: { mode: 'none', reason: 'The acceptance is deterministic and uses no model player.' } };
interface FixtureOptions { text?: string; profile?: unknown; rawProfile?: string; catalogue?: unknown; scripts?: Record<string, string>; rawPackage?: string; fit?: string; flags?: string[]; noProfile?: boolean }
function fixture(options: FixtureOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'plan-applicability-'));
  made.push(dir);
  mkdirSync(join(dir, 'docs', 'plan-review'), { recursive: true });
  mkdirSync(join(dir, 'kit'));
  writeFileSync(join(dir, 'kit', 'kit.lock.json'), JSON.stringify({ ref: 'v0.276.1', components: { 'engine-core': { files: {} }, 'grid-map': { files: {} } } }));
  writeFileSync(join(dir, 'docs', 'PLAN.md'), options.text ?? PLAN);
  writeFileSync(join(dir, 'docs', 'plan-review', 'kit-fit.md'), options.fit ?? 'Movement policy: original fixture rules over the existing grid and engine.');
  writeFileSync(join(dir, 'docs', 'check-applicability.json'), options.rawProfile ?? JSON.stringify(options.profile ?? NONE));
  writeFileSync(join(dir, 'package.json'), options.rawPackage ?? JSON.stringify({ scripts: options.scripts ?? { check: 'node fixture-check.mjs' } }));
  if (options.catalogue !== undefined) {
    mkdirSync(join(dir, 'docs', 'cards'));
    writeFileSync(join(dir, 'docs', 'cards', 'catalogue.json'), JSON.stringify(options.catalogue));
  }
  const args = ['docs/PLAN.md', '--kit', join(dir, 'no-checkout'), ...(options.noProfile === true ? [] : ['--applicability', 'docs/check-applicability.json']), ...(options.flags ?? [])];
  return { dir, args };
}
function run(options: FixtureOptions = {}) {
  const { dir, args } = fixture(options);
  const result = spawnSync(python![0]!, [...python!.slice(1), script, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: result.status, output: result.stdout + result.stderr, dir, args };
}
function fails(options: FixtureOptions, expected: string) {
  const result = run(options);
  expect(result.code, result.output).toBe(1);
  expect(result.output).toContain(expected);
}

const CARD_PLAN = PLAN
  .replace('- **WALL-01**', '- **AR-01** Apply the declared modifier once.\n- **WALL-01**')
  .replace('| SC-02 | WALL-01 |', '| SC-03 | AR-01 | Apply one modifier. |\n| SC-02 | WALL-01 |')
  .replace('SC-01, SC-02. Implement', 'SC-01, SC-02, SC-03. Build llm-playtester; run cards:whole-game. Implement')
  .replace('| Gate | Owner |', '| Gate | Owner | Clauses | Patterns |')
  .replace('|---|---|---|---|---|---|---|---|', '|---|---|---|---|---|---|---|---|---|---|')
  .replace('| npm run check | architect |', '| npm run check | architect | 1 | P-01 |')
  .replace('Exercise default-off paths when present.', 'Exercise default-off paths when present; expectNotOffered; LLM playtest; cards:check, cards:screen, cards:whole-game.')
  .replace('Unit rules, refusal and invariants, then browser acceptance of actual movement.', 'Unit rules, refusal and invariants, then browser acceptance and LLM playtest.') + `
## 9. Card-language test programme

Use cardCase for every clause and interaction; expectNotOffered covers poor setups. The mapping is ar-map.md.

| Family | Full resolve | Poor setup |
|---|---|---|
| Example | one independent check per clause | expectNotOffered |

## 10. Modifier order

| Quantity | Kit function | Ruling |
|---|---|---|
| Value | \`sumEffects\` | AR-01 |

## 11. Screen-text scan

Compare the authored text with the visible text.
`;
const CATALOGUE = { summary: { clauses: 1 }, patterns: [{ id: 'P-01' }] };

describe('explicit plan applicability', () => {
  it('checks a real non-card rule/scenario plan without any legacy optional flags', () => {
    const result = run();
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain('applicability: cards none');
    expect(result.output).not.toContain('NOTE cards:');
    expect(result.output).not.toContain('NOTE depth:');
  });

  it('keeps default card behavior and supports an explicitly required card and LLM profile', () => {
    const normal = run({ text: CARD_PLAN, catalogue: CATALOGUE, noProfile: true });
    expect(normal.code, normal.output).toBe(0);
    const required = { version: 1, cards: { mode: 'required' }, llmPlaytest: { mode: 'required' } };
    const explicit = run({ text: CARD_PLAN, catalogue: CATALOGUE, profile: required });
    expect(explicit.code, explicit.output).toBe(0);
    fails({ text: CARD_PLAN.replace('expectNotOffered', 'missing-helper'), catalogue: CATALOGUE, profile: required }, 'expectNotOffered');
    fails({ noProfile: true }, 'PROBLEM cards:');
  });

  it('checks cards and LLM independently in both mixed profiles', () => {
    const cardOnly = run({
      text: CARD_PLAN.replace('Build llm-playtester; run', 'Run').replace('; LLM playtest;', ';').replace(' and LLM playtest.', '.'),
      catalogue: CATALOGUE, profile: { ...NONE, cards: { mode: 'required' } },
    });
    expect(cardOnly.code, cardOnly.output).toBe(0);
    const llmOnly = run({
      text: PLAN.replace('Implement the movement', 'Build llm-playtester. Implement the movement')
        .replace('Exercise default-off paths when present.', 'Exercise default-off paths when present; LLM playtest.')
        .replace('Unit rules, refusal', 'LLM playtest, unit rules, refusal'),
      profile: { ...NONE, llmPlaytest: { mode: 'required' } },
    });
    expect(llmOnly.code, llmOnly.output).toBe(0);
  });

  it('allows an explicitly excluded empty catalogue without using it to infer applicability', () => {
    const result = run({ catalogue: { summary: { clauses: 0 }, patterns: [], oneOffs: [] } });
    expect(result.code, result.output).toBe(0);
  });

  it('preserves legacy opt-in behavior only when no strict applicability is supplied', () => {
    const result = run({ noProfile: true, flags: ['--cards-optional', '--depth-optional'] });
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain('NOTE cards:');
  });

  it.each(['--cards-optional', '--depth-optional', '--kit-optional', '--sessions-optional', '--sheet-optional', '--cover-skip'])('refuses %s with explicit strict applicability', flag => {
    fails({ flags: [flag, ...(flag === '--cover-skip' ? ['MOVE'] : [])] }, 'cannot combine');
  });

  it.each([
    ['unknown top key', { ...NONE, skipAll: true }],
    ['missing cards', { version: 1, llmPlaytest: NONE.llmPlaytest }],
    ['missing LLM', { version: 1, cards: NONE.cards }],
    ['unknown mode', { ...NONE, cards: { mode: 'optional', reason: 'no' } }],
    ['missing reason', { ...NONE, cards: { mode: 'none' } }],
    ['blank reason', { ...NONE, llmPlaytest: { mode: 'none', reason: '  ' } }],
    ['unknown section key', { ...NONE, cards: { ...NONE.cards, ignore: true } }],
    ['wrong version', { ...NONE, version: 2 }],
    ['boolean version', { ...NONE, version: true }],
  ])('rejects malformed applicability: %s', (_label, profile) => fails({ profile }, 'applicability:'));

  it('rejects malformed JSON and a missing applicability file', () => {
    fails({ rawProfile: '{' }, 'applicability:');
    fails({ noProfile: true, flags: ['--applicability', 'missing.json'] }, 'applicability:');
  });

  it.each([
    ['an empty rule inventory', PLAN.replace(/- \*\*(MOVE|WALL)-01\*\*[^\n]*\n/gu, ''), 'rule inventory'],
    ['an empty scenario inventory', PLAN.replace(/^\| SC-0[12] \|[^\n]*\n/gmu, ''), 'scenario inventory'],
    ['a rule mentioned outside the citation column', PLAN.replace('| SC-02 | WALL-01 | Refuse', '| SC-02 | MOVE-01 | WALL-01 Refuse'), 'WALL-01 is not covered'],
    ['a missing expected outcome', PLAN.replace('Enter the adjacent open space.', ''), 'expected outcome'],
    ['a scenario absent from phases', PLAN.replace('SC-01, SC-02. Implement', 'SC-01. Implement'), 'SC-02 is not assigned'],
    ['a phase with no session', PLAN.replace('| S1 | 1 |', '| S1 | 2 |'), 'Phase 1 is in no batch'],
    ['missing default-off depth', PLAN.replace('default-off', 'alternate'), 'default-off'],
    ['missing e2e queue instruction', PLAN.replace('e2e with the heavy', 'unit with the local'), 'e2e'],
    ['missing reuse table', PLAN.replace('## 8. Reuse map', '## 8. Other'), 'Reuse map'],
  ])('retains generic strict checks: %s', (_label, text, expected) => fails({ text }, expected));

  it.each(['deleted', 'commented', 'fenced'])('rejects a %s scenario still referenced by a phase even when its rule is covered', (mode) => {
    const row = '| SC-01 | MOVE-01 | Enter the adjacent open space. |';
    const text = PLAN.replace(row, `${row}\n| SC-03 | MOVE-01 | Enter a different adjacent open space. |`)
      .replace('SC-01, SC-02. Implement', 'SC-01, SC-02, SC-03. Implement');
    const valid = run({ text });
    expect(valid.code, valid.output).toBe(0);
    const removed = mode === 'deleted' ? '' : mode === 'commented' ? `<!--\n${row}\n-->` : `\`\`\`md\n${row}\n\`\`\``;
    fails({ text: text.replace(row, removed) }, 'phase references SC-01 but that scenario is not defined');
  });

  it('ignores example scenario definitions and phase references outside strict prose', () => {
    const text = PLAN.replace('## 3. Implementation phases', '<!--\n| SC-97 | UNKNOWN-01 | Example only. |\n-->\n\n## 3. Implementation phases')
      .replace('Implement the movement contract', '<!-- SC-98 -->\n```md\nSC-99\n```\nImplement the movement contract');
    const result = run({ text });
    expect(result.code, result.output).toBe(0);
  });

  it('does not assign a real scenario from a commented phase reference', () => {
    fails({ text: PLAN.replace('SC-01, SC-02. Implement', 'SC-01. <!-- SC-02 --> Implement') }, 'SC-02 is not assigned');
  });

  it('preserves legacy handling of dangling phase references without an explicit profile', () => {
    const result = run({ text: PLAN.replace('SC-01, SC-02. Implement', 'SC-01, SC-02, SC-99. Implement'), noProfile: true, flags: ['--cards-optional', '--depth-optional'] });
    expect(result.code, result.output).toBe(0);
  });

  it.each(['commented', 'fenced'])('rejects a %s rule definition when another real rule remains', (mode) => {
    const rule = '- **WALL-01** A wall-crossing move is refused without changing state.';
    const example = mode === 'commented' ? `<!--\n${rule}\n-->` : `\`\`\`md\n${rule}\n\`\`\``;
    fails({ text: PLAN.replace(rule, example) }, 'SC-02: WALL-01 is not defined');
  });

  it.each(['commented', 'fenced'])('allows a live rule with a duplicate only in a %s example', (mode) => {
    const rule = '- **WALL-01** A wall-crossing move is refused without changing state.';
    const example = mode === 'commented' ? `<!--\n${rule}\n-->` : `\`\`\`md\n${rule}\n\`\`\``;
    const result = run({ text: PLAN.replace(rule, `${rule}\n${example}`) });
    expect(result.code, result.output).toBe(0);
  });

  it('checks real decision table definitions while ignoring their commented or fenced examples', () => {
    const decision = '| ID | Decision |\n|---|---|\n| D1 | Use adjacent unblocked moves. |';
    const plan = PLAN.replace('## 2. Scenario catalogue', `## 1.1 Decisions\n\n${decision}\n\n## 2. Scenario catalogue`)
      .replace('| SC-02 | WALL-01 |', '| SC-02 | WALL-01, D1 |');
    const valid = run({ text: plan });
    expect(valid.code, valid.output).toBe(0);
    for (const example of [`<!--\n${decision}\n-->`, `\`\`\`md\n${decision}\n\`\`\``]) {
      fails({ text: plan.replace(decision, example) }, 'SC-02: D1 is not a defined decision');
    }
  });

  it('retains the kit-fit check', () => fails({ fit: '' }, 'no kit-fit review'));

  it.each([
    ['nonempty catalogue', { catalogue: CATALOGUE }],
    ['invalid catalogue', { catalogue: {} }],
    ['card programme', { text: PLAN + '\n## Card-language test programme\nA family.\n' }],
    ['cardCase', { text: PLAN + '\nUse cardCase for clauses.\n' }],
    ['card-language reuse', { text: PLAN.replace('`grid-map` |', '`grid-map`, `card-language` |') }],
    ['Cards as data answer', { text: PLAN.replace('Cards as data | not in this game', 'Cards as data | An authored deck with thirty cards') }],
    ['card script', { scripts: { 'cards:check': 'node check-cards.mjs' } }],
  ])('rejects cards:none contradicting %s', (_label, options) => fails(options, 'cards none contradicts'));

  it('does not hide a known catalogue behind an alternate missing path', () => {
    fails({ catalogue: CATALOGUE, flags: ['--catalogue', 'missing.json'] }, 'cards none contradicts');
  });

  it.each([
    ['LLM phase', { text: PLAN.replace('Implement the movement', 'Build llm-playtester. Implement the movement') }],
    ['LLM layer', { text: PLAN.replace('Unit rules, refusal', 'LLM playtest, unit rules, refusal') }],
    ['LLM script', { scripts: { 'playtest:llm': 'node kit/llm-playtester/run.ts' } }],
  ])('rejects llmPlaytest:none contradicting %s', (_label, options) => fails(options, 'llmPlaytest none contradicts'));

  it('distinguishes LLM utility script names from declared LLM playtest scripts', () => {
    const result = run({ scripts: { 'llm:lint': 'node lint-config.mjs' } });
    expect(result.code, result.output).toBe(0);
    for (const name of ['playtest:llm', 'llm:playtest', 'llm-playtest']) {
      fails({ scripts: { [name]: 'node run-game.mjs' } }, 'LLM playtest script');
    }
  });

  it('requires LLM declarations when explicitly required', () => {
    fails({ profile: { ...NONE, llmPlaytest: { mode: 'required' } } }, 'LLM playtest');
  });

  it('does not use a fenced example as the strict rule inventory', () => {
    const text = PLAN.replace('- **MOVE-01** A move enters an adjacent unblocked space.\n- **WALL-01** A wall-crossing move is refused without changing state.', '```md\n- **MOVE-01** A sample only.\n- **WALL-01** A sample only.\n```');
    fails({ text }, 'rule inventory');
  });

  it.each(['Rules', 'Scenario catalogue'])('does not count an HTML-commented %s inventory', (name) => {
    const next = name === 'Rules' ? '2. Scenario catalogue' : '3. Implementation phases';
    const start = name === 'Rules' ? '1. Rules' : '2. Scenario catalogue';
    const text = PLAN.replace(`## ${start}\n`, `## ${start}\n<!--`).replace(`## ${next}`, `-->\n## ${next}`);
    fails({ text }, name === 'Rules' ? 'rule inventory' : 'scenario inventory');
  });

  it.each(['`', '~'])('keeps shorter %s fences inside longer example blocks', (mark) => {
    const rules = '- **MOVE-01** A move enters an adjacent unblocked space.\n- **WALL-01** A wall-crossing move is refused without changing state.';
    fails({ text: PLAN.replace(rules, `${mark.repeat(4)}md\n${mark.repeat(3)}md\n${rules}\n${mark.repeat(3)}\n${mark.repeat(4)}`) }, 'rule inventory');
    const scenarios = '| SC-01 | MOVE-01 | Enter the adjacent open space. |\n| SC-02 | WALL-01 | Refuse the wall crossing and preserve the state. |';
    fails({ text: PLAN.replace(scenarios, `${mark.repeat(4)}md\n${mark.repeat(3)}md\n${scenarios}\n${mark.repeat(3)}\n${mark.repeat(4)}`) }, 'scenario inventory');
  });

  it('requires real text in Layers even when no LLM layer applies', () => {
    fails({ text: PLAN.replace('Unit rules, refusal and invariants, then browser acceptance of actual movement.', '<!-- a future layer -->') }, 'nonempty test Layers');
  });

  it('rejects duplicate applicability keys and unreadable package declarations', () => {
    fails({ rawProfile: JSON.stringify(NONE).replace('"version":1', '"version":1,"version":1') }, 'duplicate key version');
    fails({ rawProfile: 'null' }, 'expected version 1');
    fails({ rawPackage: '{' }, 'cannot inspect');
    fails({ rawPackage: '{"scripts":{"cards:check":null}}' }, 'script commands must be strings');
  });

  it('rejects extraction as a substitute for explicit strict validation', () => fails({ flags: ['--section', '1'] }, 'cannot combine'));

  it('does not let the Node wrapper skip strict applicability when Python is absent', () => {
    const { dir } = fixture();
    const result = spawnSync(process.execPath, [wrapper, '--plan', 'docs/PLAN.md', '--applicability', 'docs/check-applicability.json', '--skip-without-python'], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, PYTHON: '', PATH: join(dir, 'no-python'), Path: join(dir, 'no-python'), CI: '' },
    });
    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('cannot combine');
  });
});
