// cow.ts, apply.ts and copy.ts hold module-level state and GameOver is checked with instanceof: two loaded copies of
// engine-core would corrupt states silently. The first copy claims a global slot with its URL; another URL throws.
const KEY = Symbol.for('game-kit.engine-core');

export function claimEngineCore(url: string): void {
  const g = globalThis as Record<symbol, unknown>;
  const file = url.split('?')[0] as string; // a hot reload re-evaluates the same file with a query
  const held = g[KEY] as string | undefined;
  if (held !== undefined && held !== file) {
    throw new Error(
      `Two copies of engine-core are loaded (${held} and ${file}): the game and its tools must import the same kit/engine-core.`,
    );
  }
  g[KEY] = file;
}

claimEngineCore(import.meta.url);
