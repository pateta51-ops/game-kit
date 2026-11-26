import { begin, campaignRoster, changeCampaignRoster, count, emptyLog, end, fieldKey, has, linear, newCampaign, readSave, record, remainingCampaignCards, retry, scheduleCalendarEntry, startCalendarDay, type CampaignCardBox, type CampaignLog, type CampaignPlayer, type CampaignRosterEdit, type CampaignSave, type FieldDef, type Instruction, type Step } from '../../kit/campaign/index.ts';
import { newZones } from '../../kit/card-zones/index.ts';
import { createSave, draftOf, hashValue, type AnswerAction, type Ctx, type Draft, type SaveFile } from '../../kit/engine-core/index.ts';
import { botOpponent, createGameStore, defineGame, type GameDef, type GameStore } from '../../kit/game-store/index.ts';
import { newAutomaDeck } from '../../kit/automa/index.ts';
import { startFlow } from '../../kit/turn-flow/index.ts';
import { autoAnswer } from '../../kit/prompt-host/index.ts';
import type { Bot } from '../../kit/sim-pool/index.ts';
import { BASE_CARDS, loadContent, MODES, referenceRules, SEATS, viewOf, WORDS, type Ref, type RefPrompt, type RefState, type RefView, type Seat } from './rules.ts';

export const VARIANT = 'four-card-continuation-v1';
export interface ContinuationLog extends CampaignLog {
  readonly journal: readonly string[];
  readonly betweenSessions: { readonly season: string; readonly notes: readonly string[] };
}
export interface ContinuationConfig {
  readonly id: 'camp-a' | 'camp-b';
  readonly box: CampaignCardBox;
  readonly decks: Readonly<Record<'lead' | 'partner' | 'reserve', readonly string[]>>;
  readonly life: readonly [number, number];
  readonly restBonus: number;
}
export const CONFIGS: readonly ContinuationConfig[] = [
  { id: 'camp-a', box: { jab: 6, blow: 2, rally: 2, ward: 1, mend: 1 },
    decks: { lead: ['jab', 'jab', 'blow', 'ward'], partner: ['jab', 'blow', 'rally', 'rally'], reserve: ['jab', 'jab', 'jab', 'mend'] }, life: [12, 12], restBonus: 2 },
  { id: 'camp-b', box: { jab: 4, blow: 3, rally: 3, ward: 1, mend: 1 },
    decks: { lead: ['jab', 'blow', 'rally', 'ward'], partner: ['jab', 'jab', 'blow', 'blow'], reserve: ['jab', 'rally', 'rally', 'mend'] }, life: [14, 10], restBonus: 4 },
];
const STEPS: readonly Step[] = [{ kind: 'scenario', id: 'arrival' }, { kind: 'scenario', id: 'crossing' }];
const FIELDS: readonly FieldDef[] = [
  { id: 'supplies', kind: 'count', label: 'Supplies' }, { id: 'lifeBonus', kind: 'count', label: 'Rest bonus' },
  ...['arrived', 'rested', 'pressed', 'ready', 'finished-arrival', 'finished-crossing'].map(id => ({ id, kind: 'key' as const, label: id })),
];
const key = (id: string): string => { const value = fieldKey(FIELDS, id); if (value === undefined) throw new Error('unknown continuation field'); return value; };
const version = (config: ContinuationConfig) => VARIANT + ':' + hashValue(config);
const instructions = (config: ContinuationConfig): Readonly<Record<string, Instruction>> => ({
  arrival: { id: 'arrival', text: 'Arrive at camp.', cite: 'Campaign rules: day 1', ops: [{ op: 'record', key: key('arrived') }] },
  stock: { id: 'stock', text: 'Stock one supply.', cite: 'Campaign rules: day 2', ops: [{ op: 'add', key: key('supplies'), n: 1 }] },
  route: { id: 'route', text: 'Rest or press on?', cite: 'Campaign rules: day 2', when: { count: key('supplies'), atLeast: 1 }, choose: [
    { id: 'rest', label: 'Rest', ops: [{ op: 'set', key: key('lifeBonus'), n: config.restBonus }, { op: 'record', key: key('rested') }] },
    { id: 'press', label: 'Press on', ops: [{ op: 'set', key: key('lifeBonus'), n: 0 }, { op: 'record', key: key('pressed') }] },
  ] },
  ready: { id: 'ready', text: 'Continue to the crossing.', cite: 'Campaign rules: day 2', when: { any: [{ has: key('rested') }, { has: key('pressed') }] }, ops: [{ op: 'record', key: key('ready') }] },
});
function rosterProblem(players: readonly CampaignPlayer[]): string | undefined {
  if (players.length !== 3 || players.some(player => !['lead', 'partner', 'reserve'].includes(player.id))) return 'continuation requires the declared three roster identities';
  if (players.find(player => player.id === 'lead')?.status !== 'active' || players.filter(player => player.status === 'active').length !== 2) return 'continuation requires an active lead and exactly one active partner';
  if (players.some(player => player.deck.length !== (player.status === 'retired' ? 0 : 4))) return 'continuation requires four-card decks';
  return undefined;
}
const rosterRules = (config: ContinuationConfig) => ({ box: config.box, allow: (_before: readonly CampaignPlayer[], after: readonly CampaignPlayer[]) => rosterProblem(after) });
function gameLog(log: CampaignLog): ContinuationLog {
  const value = log as ContinuationLog;
  if (!Array.isArray(value.journal) || !value.journal.every(item => typeof item === 'string') || typeof value.betweenSessions?.season !== 'string'
    || !Array.isArray(value.betweenSessions.notes) || !value.betweenSessions.notes.every(item => typeof item === 'string')) throw new Error('invalid game-owned campaign fields');
  return value;
}
function validateLog(config: ContinuationConfig, log: CampaignLog): void {
  gameLog(log);
  remainingCampaignCards(log, config.box);
  const problem = rosterProblem(campaignRoster(log));
  if (problem) throw new Error(problem);
}
function canonicalStep(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return -1;
  const step = value as Partial<Step>;
  if (step.kind !== 'scenario' || Object.keys(step).some(name => name !== 'kind' && name !== 'id')) return -1;
  return STEPS.findIndex(candidate => candidate.id === step.id);
}
const completedInLog = (log: CampaignLog, completed: number) => log?.v === 1 && Array.isArray(log.recorded)
  && STEPS.every((step, index) => has(log, key('finished-' + step.id)) === (index < completed));
function validateProgress(save: CampaignSave): void {
  function invalid(): never { throw new Error('invalid continuation campaign progress'); }
  const position = save.position;
  if (save.v !== 1 || !position || typeof position !== 'object' || !['active', 'over'].includes(save.status)) invalid();
  const current = save.status === 'over' && position.step === null ? STEPS.length : canonicalStep(position.step);
  if (current < 0 || (save.status === 'over' && current !== STEPS.length) || !Array.isArray(position.done)
    || position.done.length !== current || position.done.some((entry, index) => entry !== 'scenario:' + STEPS[index]?.id)) invalid();
  if (!position.resolutions || typeof position.resolutions !== 'object' || Array.isArray(position.resolutions)
    || Object.keys(position.resolutions).length !== position.done.length) invalid();
  const latest = new Map<string, string>();
  let last = -1;
  for (const attempt of save.history) {
    const index = canonicalStep(attempt?.step);
    if (index < 0 || index < last || index > last + 1 || attempt.seed !== save.seed + index
      || typeof attempt.resolution !== 'string' || !['won', 'lost', 'tied'].includes(attempt.resolution)
      || !completedInLog(attempt.logBefore, index)) invalid();
    last = index;
    latest.set('scenario:' + attempt.step.id, attempt.resolution);
  }
  // Completed retries remain in history while the retried step is absent from done/resolutions.
  if (last < current - 1 || last > Math.min(current, STEPS.length - 1)
    || position.done.some(step => position.resolutions[step] !== latest.get(step)) || !completedInLog(save.log, current)) invalid();
  if (save.attempt !== undefined && (current === STEPS.length || canonicalStep(save.attempt?.step) !== current
    || save.attempt.seed !== save.seed + current || save.attempt.resolution !== undefined
    || !completedInLog(save.attempt.logBefore, current))) invalid();
}
function validateSave(config: ContinuationConfig, save: CampaignSave): void {
  if (save.id !== config.id || save.version !== version(config) || save.status === 'incompatible' || !Array.isArray(save.history)
    || !Number.isSafeInteger(save.seed) || save.seed < 0 || save.seed >= Number.MAX_SAFE_INTEGER) throw new Error('continuation variant or configuration mismatch');
  validateProgress(save);
  validateLog(config, save.log);
  for (const attempt of [...save.history, ...(save.attempt ? [save.attempt] : [])]) validateLog(config, attempt.logBefore);
}
export function newContinuation(config: ContinuationConfig, seed: number): CampaignSave {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed >= Number.MAX_SAFE_INTEGER || !config.life.every(value => Number.isSafeInteger(value) && value > 0) || !Number.isSafeInteger(config.restBonus) || config.restBonus < 0) throw new Error('invalid continuation setup');
  const initial: ContinuationLog = { ...emptyLog(), betweenSessions: { season: 'rain', notes: ['preserve this game-owned field'] }, journal: ['campaign-start'] };
  let log: CampaignLog = initial;
  log = changeCampaignRoster(log, [
    { kind: 'join', player: 'lead', deck: config.decks.lead }, { kind: 'join', player: 'partner', deck: config.decks.partner },
    { kind: 'join', player: 'reserve', deck: config.decks.reserve }, { kind: 'sitOut', player: 'reserve' },
  ], rosterRules(config));
  log = scheduleCalendarEntry(log, 1, 'arrival');
  for (const id of ['stock', 'route', 'ready']) log = scheduleCalendarEntry(log, 2, id);
  return newCampaign(config.id, version(config), { kind: 'scenario', id: 'arrival' }, seed, log);
}
export function editContinuationRoster(config: ContinuationConfig, save: CampaignSave, edits: readonly CampaignRosterEdit[]): CampaignSave {
  validateSave(config, save);
  if (save.attempt || save.status !== 'active') throw new Error('roster changes require an idle continuation');
  const log = changeCampaignRoster(save.log, edits, rosterRules(config));
  return { ...save, log };
}
const BOT: Bot<RefView, AnswerAction> = { name: 'continuation-first-legal', choose: (_view, answers) => {
  const answer = answers.find(value => value.picks[0] === 'yes') ?? answers[0];
  if (answer === undefined) throw new Error('continuation bot has no legal answer');
  return answer;
} };
export interface ContinuedScenario {
  readonly campaign: CampaignSave;
  readonly log: CampaignLog;
  readonly definition: GameDef<Ref, RefView, Seat>;
  readonly store: GameStore<Ref, RefView>;
  readonly players: Readonly<Record<Seat, string>>;
  readonly free: Readonly<Record<string, number>>;
  readonly configDigest: string;
}
function playBegun(config: ContinuationConfig, campaign: CampaignSave, log: CampaignLog): ContinuedScenario {
  validateSave(config, campaign);
  if (!campaign.attempt || campaign.position.step?.id !== campaign.attempt.step.id || hashValue(log) !== hashValue(campaign.attempt.logBefore)
    || hashValue(campaign.log) !== hashValue(log)) throw new Error('continuation has no matching scenario-start snapshot');
  const active = campaignRoster(log).filter(player => player.status === 'active');
  const lead = active.find(player => player.id === 'lead'), partner = active.find(player => player.id !== 'lead');
  if (!lead || !partner) throw new Error('continuation requires two active seats');
  const totals = new Map<string, number>();
  for (const player of active) for (const card of player.deck) totals.set(card, (totals.get(card) ?? 0) + 1);
  const records = BASE_CARDS.filter(card => totals.has(card.id)).map(card => ({ ...card, copies: totals.get(card.id) ?? 0 }));
  if (records.length !== totals.size) throw new Error('continuation deck contains unsupported card data');
  const loaded = loadContent(records), content = { ...loaded, hand: 4 };
  const queues = new Map(records.map(card => [card.id, Object.keys(content.cards).filter(id => content.cards[id] === card.id)]));
  const allocate = (player: CampaignPlayer): string[] => player.deck.map(card => {
    const instance = queues.get(card)?.shift();
    if (instance === undefined) throw new Error('continuation has insufficient physical copies');
    return instance;
  });
  const hands = { 0: allocate(lead), 1: allocate(partner) };
  const rules = { ...referenceRules(content), setup(ctx: Ctx<Ref>) {
    const state = draftOf(ctx);
    state.zones = newZones({ deck: { seen: 'count', cards: [] }, 'hand:0': { seen: 'owner', owner: '0', cards: hands[0] },
      'hand:1': { seen: 'owner', owner: '1', cards: hands[1] }, 'play:0': { seen: 'all' }, 'play:1': { seen: 'all' }, discard: { seen: 'all' } }) as Draft<RefState['zones']>;
    state.automa = newAutomaDeck(MODES, ctx.rng);
    startFlow(ctx);
  } };
  const lifeBonus = count(log, key('lifeBonus'));
  const scenario = campaign.attempt.step.id;
  const definition = defineGame<Ref, RefView, Seat>({ rules, content, seats: SEATS,
    start: seed => ({ options: { seed, level: 'normal', bots: ['1'], scenario }, rules: { life: { 0: config.life[0] + lifeBonus, 1: config.life[1] }, rounds: 2 } }),
    view: viewOf, forced: prompt => autoAnswer(prompt, true), opponent: botOpponent<RefView, RefPrompt>(BOT), words: WORDS });
  return { campaign, log, definition, store: createGameStore(definition, { seat: '0', seed: String(campaign.attempt.seed), undo: 'free' }),
    players: { 0: lead.id, 1: partner.id }, free: remainingCampaignCards(log, config.box), configDigest: hashValue(config) };
}
export function continueCampaign(config: ContinuationConfig, save: CampaignSave, request: { readonly day: number; readonly answers?: Record<string, string>; readonly edits?: readonly CampaignRosterEdit[] }) {
  validateSave(config, save);
  if (save.attempt) throw new Error('scenario is already in progress');
  if (save.status !== 'active') throw new Error('campaign has no next scenario');
  const day = STEPS.findIndex(step => step.id === save.position.step?.id) + 1;
  if (day === 0 || request.day !== day) throw new Error('continuation day does not match the next scenario');
  const calendar = startCalendarDay(save.log, day, instructions(config), request.answers, save);
  if (calendar.ask) return { status: 'choice' as const, campaign: save, ask: calendar.ask };
  const repeated = calendar.log === save.log;
  if (repeated && request.edits?.length) throw new Error('continuation day already processed; deck edits cannot repeat');
  const log = changeCampaignRoster(calendar.log, request.edits ?? [], rosterRules(config));
  if (day === 2 && !has(log, key('ready'))) throw new Error('crossing route is unresolved');
  const started = begin({ ...save, log }, save.seed + day - 1);
  return { status: 'playing' as const, session: playBegun(config, started.save, started.log), calendar: repeated ? 'noop' as const : 'processed' as const, ran: calendar.ran.map(entry => entry.id) };
}
function validateSession(config: ContinuationConfig, session: ContinuedScenario): void {
  validateSave(config, session.campaign);
  if (!session.campaign.attempt || session.configDigest !== hashValue(config)) throw new Error('continuation variant or configuration mismatch');
  const start = session.definition.start(String(session.campaign.attempt.seed));
  const state = session.store.get().state;
  if (hashValue(state.options) !== hashValue(start.options) || hashValue(state.rules) !== hashValue(start.rules)) throw new Error('scenario setup does not match continuation snapshot');
}
export function finishScenario(config: ContinuationConfig, session: ContinuedScenario): CampaignSave {
  validateSession(config, session);
  const result = session.store.get().state.result;
  if (result === null) throw new Error('continuation requires an actual terminal result');
  const scenario = session.campaign.attempt?.step.id;
  if (scenario === undefined) throw new Error('continuation has no active scenario');
  const recorded = gameLog(record(session.log, key('finished-' + scenario)));
  const journal = recorded.journal;
  if (!Array.isArray(journal) || !journal.every(value => typeof value === 'string')) throw new Error('invalid game-owned journal');
  const log: ContinuationLog = { ...recorded, journal: [...journal, 'finished:' + scenario] };
  return end(session.campaign, { log, resolution: result.winner === '0' ? 'won' : result.winner === '1' ? 'lost' : 'tied' }, linear(STEPS));
}
export function retryContinuation(config: ContinuationConfig, save: CampaignSave): CampaignSave { validateSave(config, save); return retry(save); }

export function serializeContinuation(config: ContinuationConfig, campaign: CampaignSave, session?: ContinuedScenario, savedAt?: string): string {
  validateSave(config, campaign);
  if (Boolean(campaign.attempt) !== Boolean(session) || (session && (hashValue(session.campaign) !== hashValue(campaign) || session.configDigest !== hashValue(config)))) throw new Error('archive requires its matching active scenario');
  if (session) validateSession(config, session);
  if (session && !savedAt) throw new Error('scenario archive requires a caller-supplied save timestamp');
  const scenario = session ? createSave(session.definition.rules, { ...session.store.saved(), savedAt: savedAt ?? '' }, session.definition.content, { version: 1, appCommit: VARIANT }) : undefined;
  return JSON.stringify({ version: 1, variant: VARIANT, configuration: config.id, configDigest: hashValue(config), campaign, ...(scenario ? { scenario } : {}) });
}
export function restoreContinuation(config: ContinuationConfig, text: string) {
  const input = JSON.parse(text) as { version?: unknown; variant?: unknown; configuration?: unknown; configDigest?: unknown; campaign?: unknown; scenario?: SaveFile<Ref> } | null;
  if (!input || input.version !== 1 || input.variant !== VARIANT || input.configuration !== config.id || input.configDigest !== hashValue(config)) throw new Error('continuation variant or configuration mismatch');
  const campaign = readSave(input.campaign, version(config));
  if (!campaign) throw new Error('invalid continuation archive');
  validateSave(config, campaign);
  if (!input.scenario) {
    if (campaign.attempt) throw new Error('archive is missing its active scenario');
    return { status: 'between' as const, campaign };
  }
  if (!campaign.attempt) throw new Error('archive has no campaign attempt for its scenario');
  const session = playBegun(config, campaign, campaign.attempt.logBefore);
  const start = session.definition.start(String(campaign.attempt.seed));
  if (hashValue(input.scenario.options) !== hashValue(start.options) || hashValue(input.scenario.rules) !== hashValue(start.rules)) throw new Error('scenario setup does not match continuation snapshot');
  const error = session.store.load(input.scenario);
  if (error !== null) throw new Error(error);
  return { status: 'playing' as const, session };
}
