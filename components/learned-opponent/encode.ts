// Encoder helpers (K125, from the rftg study): every input starts at -1; thermometer counts, per-key presence, seat-relative blocks.
export interface Slot {
  readonly at: number;
  readonly n: number;
  readonly keys?: ReadonlyMap<string | number, number>;
}

/** The input layout of one game's encoder; `names` go into the weight file and are checked on load. */
export class Inputs {
  readonly names: string[] = [];
  private add(names: string[], keys?: Map<string | number, number>): Slot {
    const at = this.names.length;
    this.names.push(...names);
    return keys ? { at, n: names.length, keys } : { at, n: names.length };
  }
  /** `n` inputs: input i is +1 when the count is greater than i. */
  thermo(name: string, n: number): Slot {
    return this.add(Array.from({ length: n }, (_, i) => `${name}>${String(i)}`));
  }
  /** One input per key (card id, or card property such as a tag or cost): +1 when present. */
  presence(name: string, keys: readonly (string | number)[]): Slot {
    return this.add(keys.map((k) => `${name}:${String(k)}`), new Map(keys.map((k, i) => [k, i])));
  }
  value(name: string): Slot {
    return this.add([name]);
  }
  /** One block per seat in seat-relative order: `build('s0.')` is the encoding seat itself, `s1.` the next seat... */
  perSeat<T>(seats: number, build: (prefix: string) => T): T[] {
    return Array.from({ length: seats }, (_, i) => build(`s${String(i)}.`));
  }
}

export const blank = (inputs: Inputs): Float32Array => new Float32Array(inputs.names.length).fill(-1);

export function thermo(x: Float32Array, slot: Slot, count: number): void {
  for (let i = 0; i < slot.n; i += 1) x[slot.at + i] = count > i ? 1 : -1;
}

/** Sets the inputs of the present keys to `v` (default +1); an unknown key throws. */
export function present(x: Float32Array, slot: Slot, keys: Iterable<string | number>, v = 1): void {
  for (const k of keys) {
    const i = slot.keys?.get(k);
    if (i === undefined) throw new RangeError(`unknown key ${String(k)}`);
    x[slot.at + i] = v;
  }
}

export function setValue(x: Float32Array, slot: Slot, v: number): void {
  x[slot.at] = v;
}

/** Seats in the order the encoder writes them: `seat` first, then the others in turn order. */
export const seatOrder = (seat: number, seats: number): number[] => Array.from({ length: seats }, (_, i) => (seat + i) % seats);

/** How far each value is behind the leader (0 for the leader). */
export function behind(values: readonly number[]): number[] {
  const top = Math.max(...values);
  return values.map((v) => top - v);
}
