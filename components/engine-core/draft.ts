// The working copy of a state inside `applyAction`. The state is readonly all the way
// down; handlers write to the draft (through the copy-on-write barrier of core/cow.ts), and `applyAction` returns the
// frozen result as a `GameState`. A homomorphic mapped type keeps arrays and tuples as they are and drops `readonly`.
export type Draft<T> = T extends object ? { -readonly [K in keyof T]: Draft<T[K]> } : T;
