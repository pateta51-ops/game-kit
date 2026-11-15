// Fake language types for the literalsOf test.
export type Formula = 'runs' | 'hits' | 'outs';
export type Step = { op: 'gain'; n: number } | { op?: 'roll' | 'reroll'; dice: number } | { kind: 'if'; then: Step[] };
