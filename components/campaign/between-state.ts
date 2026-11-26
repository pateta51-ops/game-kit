export interface CalendarEntry {
  readonly day: number;
  readonly instruction: string;
}

export interface CampaignCalendar {
  readonly startedThrough: number;
  readonly entries: readonly CalendarEntry[];
}

export interface CampaignPlayer {
  readonly id: string;
  readonly status: 'active' | 'sitting-out' | 'retired';
  readonly deck: readonly string[];
}

export interface CampaignBetweenSessions {
  readonly calendar?: CampaignCalendar;
  readonly roster?: readonly CampaignPlayer[];
}

export const isCampaignDay = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
export const isCampaignId = (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function validCalendar(calendar: unknown): boolean {
  if (!isRecord(calendar) ||
    (calendar['startedThrough'] !== 0 && !isCampaignDay(calendar['startedThrough'])) ||
    !Array.isArray(calendar['entries'])) return false;
  const seen = new Set<string>();
  return calendar['entries'].every((entry: unknown) => {
    if (!isRecord(entry) || !isCampaignDay(entry['day']) || !isCampaignId(entry['instruction'])) return false;
    const key = `${String(entry['day'])}:${entry['instruction']}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validRoster(roster: unknown): boolean {
  if (!Array.isArray(roster)) return false;
  const seen = new Set<string>();
  return roster.every((player: unknown) => {
    if (!isRecord(player) || !isCampaignId(player['id']) || seen.has(player['id'])) return false;
    const status = player['status'], deck = player['deck'];
    if (!Array.isArray(deck) || !deck.every(isCampaignId)) return false;
    if (status !== 'active' && status !== 'sitting-out' && (status !== 'retired' || deck.length !== 0)) return false;
    seen.add(player['id']);
    return true;
  });
}

export function validBetweenSessions(value: unknown): boolean {
  return isRecord(value) &&
    (value['calendar'] === undefined || validCalendar(value['calendar'])) &&
    (value['roster'] === undefined || validRoster(value['roster']));
}
