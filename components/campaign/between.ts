import { betweenSessionsKey, isCampaignDay, isCampaignId, type CampaignPlayer } from './between-state.ts';
import { runBetween, type Instruction, type InstructionAsk, type Ran } from './graph.ts';
import type { CampaignLog } from './log.ts';
import type { CampaignSave } from './steps.ts';

export type { CalendarEntry, CampaignBetweenSessions, CampaignCalendar, CampaignPlayer } from './between-state.ts';

export function scheduleCalendarEntry(log: CampaignLog, day: number, instruction: string): CampaignLog {
  if (!isCampaignDay(day)) throw new Error('campaign: calendar day must be a positive safe integer');
  if (!isCampaignId(instruction)) throw new Error('campaign: missing calendar instruction id');
  const { startedThrough = 0, entries = [] } = log[betweenSessionsKey]?.calendar ?? {};
  if (day <= startedThrough) throw new Error(`campaign: day ${day} has already started`);
  if (entries.some(e => e.day === day && e.instruction === instruction))
    throw new Error(`campaign: duplicate instruction ${instruction} for day ${day}`);
  return {
    ...log,
    [betweenSessionsKey]: { ...log[betweenSessionsKey], v: 1, calendar: { startedThrough, entries: [...entries, { day, instruction }] } },
  };
}

export interface CalendarDayResult {
  readonly log: CampaignLog;
  readonly ran: readonly Ran[];
  readonly ask?: InstructionAsk;
}

/** Resolve a day's between-scenario instructions once, in recording order. An unanswered choice commits nothing. */
export function startCalendarDay(
  log: CampaignLog,
  day: number,
  instructions: Readonly<Record<string, Instruction>>,
  answers: Record<string, string> = {},
  save?: CampaignSave,
): CalendarDayResult {
  if (!isCampaignDay(day)) throw new Error('campaign: calendar day must be a positive safe integer');
  const { startedThrough = 0, entries = [] } = log[betweenSessionsKey]?.calendar ?? {};
  if (day <= startedThrough) return { log, ran: [] };
  const pending = entries.find(e => e.day > startedThrough && e.day < day);
  if (pending) throw new Error(`campaign: cannot skip pending day ${pending.day}`);
  const list = entries.filter(e => e.day === day).map(({ instruction }) => {
    const rule = Object.hasOwn(instructions, instruction) ? instructions[instruction] : undefined;
    if (rule?.id !== instruction) throw new Error(`campaign: missing calendar instruction ${instruction}`);
    if (rule.inGame) throw new Error(`campaign: calendar instruction ${instruction} is in-game only`);
    return rule;
  });
  const result = runBetween(list, log, `day:${day}`, answers, save);
  if (result.ask) return result;
  return {
    ...result,
    log: {
      ...result.log,
      [betweenSessionsKey]: { ...result.log[betweenSessionsKey], v: 1, calendar: { startedThrough: day, entries } },
    },
  };
}

export type CampaignRosterEdit =
  | { readonly kind: 'join' | 'setDeck'; readonly player: string; readonly deck: readonly string[] }
  | { readonly kind: 'sitOut' | 'return' | 'retire'; readonly player: string };

export type CampaignCardBox = Readonly<Record<string, number>>;
export interface CampaignRosterRules {
  readonly box: CampaignCardBox;
  /** Return a refusal for a game-owned restriction. Must be pure. */
  allow?(before: readonly CampaignPlayer[], after: readonly CampaignPlayer[], edits: readonly CampaignRosterEdit[]): string | undefined;
}

export const campaignRoster = (log: CampaignLog): readonly CampaignPlayer[] => log[betweenSessionsKey]?.roster ?? [];

/** The unused copies in a shared box. A card absent from the box has no copies. */
export function remainingCampaignCards(log: CampaignLog, box: CampaignCardBox): Readonly<Record<string, number>> {
  const remaining = new Map(Object.entries(box));
  for (const [card, copies] of remaining) {
    if (!isCampaignId(card) || !Number.isSafeInteger(copies) || copies < 0) throw new Error(`campaign: invalid box limit for ${card}`);
  }
  for (const player of campaignRoster(log)) {
    for (const card of player.deck) {
      const copies = remaining.get(card);
      if (copies === undefined) throw new Error(`campaign: ${player.id} uses card ${card}, absent from the shared box`);
      if (copies === 0) throw new Error(`campaign: ${player.id} needs another copy of ${card} from the shared box`);
      remaining.set(card, copies - 1);
    }
  }
  return Object.fromEntries(remaining);
}

/** Apply roster and deck edits in order, then check the final shared allocation and the game's rules. */
export function changeCampaignRoster(
  log: CampaignLog,
  edits: readonly CampaignRosterEdit[],
  rules: CampaignRosterRules,
): CampaignLog {
  const before = campaignRoster(log);
  const players = new Map(before.map(p => [p.id, p]));
  for (const edit of edits) {
    const id = edit.player;
    if (!isCampaignId(id)) throw new Error('campaign: missing roster player id');
    const player = players.get(id);
    if (edit.kind === 'join') {
      if (player) throw new Error(`campaign: player ${id} is already in the roster`);
      players.set(id, { id, status: 'active', deck: [...edit.deck] });
      continue;
    }
    if (!player || player.status === 'retired') throw new Error(`campaign: unavailable roster player ${id}`);
    switch (edit.kind) {
      case 'sitOut':
        if (player.status !== 'active') throw new Error(`campaign: player ${id} is already sitting out`);
        players.set(id, { ...player, status: 'sitting-out' });
        break;
      case 'return':
        if (player.status !== 'sitting-out') throw new Error(`campaign: player ${id} is not sitting out`);
        players.set(id, { ...player, status: 'active' });
        break;
      case 'retire': players.set(id, { ...player, status: 'retired', deck: [] }); break;
      case 'setDeck': players.set(id, { ...player, deck: [...edit.deck] }); break;
    }
  }
  const roster = [...players.values()];
  const next: CampaignLog = { ...log, [betweenSessionsKey]: { ...log[betweenSessionsKey], v: 1, roster } };
  remainingCampaignCards(next, rules.box);
  const reason = rules.allow?.(before, roster, edits);
  if (reason !== undefined) throw new Error(`campaign: ${reason}`);
  return edits.length === 0 ? log : next;
}
