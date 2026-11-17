export type Option = { value: string; label: string };
export type SetupSpec = {
  seats: { min: number; max: number; count?: number; kinds: Option[]; names?: boolean };
  scenarios?: Option[];
  difficulties?: Option[];
  extra?: { key: string; label: string; options: Option[]; default?: string }[];
};
export type Setup = { seats: { kind: string; name?: string }[]; scenario?: string; difficulty?: string; [extra: string]: unknown };

const core = ['seats', 'scenario', 'difficulty'];

export function defaultSetup(spec: SetupSpec): Setup {
  const n = Math.min(spec.seats.max, Math.max(spec.seats.min, spec.seats.count ?? spec.seats.min));
  const s: Setup = { seats: Array.from({ length: n }, () => ({ kind: spec.seats.kinds[0]?.value ?? '' })) };
  if (spec.scenarios) s.scenario = spec.scenarios[0]?.value ?? '';
  if (spec.difficulties) s.difficulty = spec.difficulties[0]?.value ?? '';
  for (const e of spec.extra ?? []) if (!core.includes(e.key)) s[e.key] = e.default ?? e.options[0]?.value ?? '';
  return s;
}

export function validateSetup(spec: SetupSpec, setup: Setup): string[] {
  const err: string[] = [];
  const has = (o: Option[], v: unknown) => o.some((x) => x.value === v);
  const n = setup.seats?.length ?? 0;
  if (n < spec.seats.min || n > spec.seats.max) err.push('seats');
  else if (setup.seats.some((s) => !has(spec.seats.kinds, s.kind))) err.push('seat-kind');
  if (spec.scenarios && !has(spec.scenarios, setup.scenario)) err.push('scenario');
  if (spec.difficulties && !has(spec.difficulties, setup.difficulty)) err.push('difficulty');
  for (const e of spec.extra ?? []) if (!core.includes(e.key) && !has(e.options, setup[e.key])) err.push(e.key);
  return err;
}
export const defaultWords = { start: 'Start', seats: 'Players', seat: 'Seat', name: 'Name', scenario: 'Scenario', difficulty: 'Difficulty', invalid: 'Check the set-up' };
export type Words = typeof defaultWords;
