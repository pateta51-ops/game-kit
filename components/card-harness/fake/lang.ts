// Fake language types for the literalsOf test.
export type Formula = 'runs' | 'hits' | 'outs';
export type Step = { op: 'gain'; n: number } | { op?: 'roll' | 'reroll'; dice: number } | { kind: 'if'; then: Step[] };
export type Effect = { gain: number } | { draw: { n: number } } | { discard: true } | { hit: 1; miss?: 2 };
export type Mixed = number | { gain: number } | { hit: 1; miss?: 2 } | ({ pa: 1 } & { pb: 2 });
