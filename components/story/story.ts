// Story as data only (flavour: no rule lives here). Draws nothing; loads in node.
export type Picture = { file?: string; note: string };
export type Line = { speaker?: string; text: string; fallback?: string };
// A beat is one screen of reading. `kind`/`data` are open for later rows (a question beat, a page tree, panels).
export type Beat = { id?: string; lines: Line[]; picture?: Picture; kind?: string; data?: unknown };
export type SlotName = 'intro' | 'win' | 'loss' | 'teaser' | 'recap';
export type Part = { id: string; title?: string; beats: Beat[] };
export type Scenario = {
  id: string;
  title: string;
  slots?: Partial<Record<SlotName, Beat[]>>;
  stages?: Record<number, Beat[]>;
  // The story sheet: parts in reading order, usually 'before' then 'after'.
  sheet: Part[];
};
export type Speaker = { id: string; name: string; kind?: string };
export type Story = { speakers: Speaker[]; scenarios: Scenario[] };

export const NARRATOR = 'narrator';
export type Said = { speaker: string; name: string; text: string; fallenBack: boolean };
export type SeenBeat = { id?: string; lines: Said[]; picture?: Picture; kind?: string; data?: unknown };

export const speakerName = (s: Story, id: string) => s.speakers.find((x) => x.id === id)?.name ?? id;

// A named character not in play: the fallback is read as a narrator line; no fallback, the line is dropped.
export function resolveLine(s: Story, l: Line, inPlay: readonly string[]): Said | null {
  if (!l.speaker || l.speaker === NARRATOR) return { speaker: NARRATOR, name: '', text: l.text, fallenBack: false };
  if (inPlay.includes(l.speaker)) return { speaker: l.speaker, name: speakerName(s, l.speaker), text: l.text, fallenBack: false };
  return l.fallback === undefined ? null : { speaker: NARRATOR, name: '', text: l.fallback, fallenBack: true };
}

export function resolveBeat(s: Story, b: Beat, inPlay: readonly string[]): SeenBeat {
  const lines = b.lines.map((l) => resolveLine(s, l, inPlay)).filter((x): x is Said => x !== null);
  return { ...b, lines };
}

export const findScenario = (s: Story, id: string) => s.scenarios.find((x) => x.id === id);

export function slotBeats(s: Story, scenarioId: string, slot: SlotName | { stage: number }, inPlay: readonly string[]): SeenBeat[] {
  const sc = findScenario(s, scenarioId);
  const beats = !sc ? [] : typeof slot === 'string' ? (sc.slots?.[slot] ?? []) : (sc.stages?.[slot.stage] ?? []);
  return beats.map((b) => resolveBeat(s, b, inPlay)).filter((b) => b.lines.length > 0 || b.picture);
}

// Parts up to the furthest one reached are shown (the first always); later ones stay hidden. Reopen at any time.
export function visibleParts(sc: Scenario, reached: readonly string[]): Part[] {
  const last = Math.max(0, ...reached.map((id) => sc.sheet.findIndex((p) => p.id === id)));
  return sc.sheet.slice(0, last + 1);
}

export function sheetView(s: Story, scenarioId: string, reached: readonly string[], inPlay: readonly string[]) {
  const sc = findScenario(s, scenarioId);
  if (!sc) return [];
  return visibleParts(sc, reached).map((p) => ({ id: p.id, title: p.title, beats: p.beats.map((b) => resolveBeat(s, b, inPlay)) }));
}

// A picture slot shows its text note until the file exists.
export function pictureView(p: Picture, exists: (file: string) => boolean): { kind: 'file'; file: string } | { kind: 'note'; note: string } {
  return p.file !== undefined && exists(p.file) ? { kind: 'file', file: p.file } : { kind: 'note', note: p.note };
}

export function storyProblems(s: Story): string[] {
  const out: string[] = [];
  const ids = new Set(s.speakers.map((x) => x.id));
  if (ids.has(NARRATOR)) out.push(`speaker id "${NARRATOR}" is reserved`);
  if (ids.size !== s.speakers.length) out.push('duplicate speaker id');
  if (new Set(s.scenarios.map((x) => x.id)).size !== s.scenarios.length) out.push('duplicate scenario id');
  for (const sc of s.scenarios) {
    if (new Set(sc.sheet.map((p) => p.id)).size !== sc.sheet.length) out.push(`${sc.id}: duplicate part id`);
    const beats = [...Object.values(sc.slots ?? {}).flat(), ...Object.values(sc.stages ?? {}).flat(), ...sc.sheet.flatMap((p) => p.beats)];
    for (const l of beats.flatMap((b) => b.lines)) if (l.speaker && l.speaker !== NARRATOR && !ids.has(l.speaker)) out.push(`${sc.id}: unknown speaker "${l.speaker}"`);
  }
  return out;
}
