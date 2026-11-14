// Two copies of engine-core fail loudly; the same copy evaluated again (hot reload, test isolation) does not.
import { describe, expect, it } from 'vitest';
import { claimEngineCore } from './index';

describe('one copy of engine-core', () => {
  it('a second copy at another URL throws; the same URL, with or without a query, does not', () => {
    const g = globalThis as Record<symbol, unknown>;
    const key = Symbol.for('game-kit.engine-core');
    const held = g[key] as string;
    expect(held).toMatch(/engine-core\/single\.ts$/);
    expect(() => claimEngineCore(held)).not.toThrow();
    expect(() => claimEngineCore(`${held}?t=123`)).not.toThrow();
    expect(() => claimEngineCore('file:///elsewhere/kit/engine-core/single.ts')).toThrow(
      /Two copies of engine-core are loaded .*the game and its tools must import the same kit\/engine-core/,
    );
    expect(g[key]).toBe(held);
  });
});
