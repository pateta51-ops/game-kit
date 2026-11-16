// Event splash, pure part (K155): decides from the engine event list whether a story splash opens. Draws nothing.
import type { Line, Picture } from './story.ts';
export type Splash = { title?: string; picture?: Picture; line: Line; note?: string };
export type SplashEvent = { type: string; id?: string | number };

// `lookup` is the game's table from event to splash: undefined where the story has no line. `shown` holds the keys already opened
// (the game keeps it); an event opens once. Events without an id and without `keyOf` never open (nothing to count them by).
export function splashFor<E extends SplashEvent>(events: readonly E[], lookup: (e: E) => Splash | undefined, shown: ReadonlySet<string>, keyOf?: (e: E) => string | undefined): { key: string; splash: Splash } | null {
  for (const e of events) {
    const k = keyOf ? keyOf(e) : e.id === undefined ? undefined : `${e.type}:${e.id}`;
    if (k === undefined || shown.has(k)) continue;
    const splash = lookup(e);
    if (splash) return { key: k, splash };
  }
  return null;
}
// 4 s, never by itself under reduced motion.
export const splashAutoCloseMs = (reduced: boolean, ms = 4000): number | null => (reduced ? null : ms);
