const stem = (path: string): string => path.replace(/\.[a-z0-9]+$/i, '');
const tail = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** Music by folder: the tracks of `slot` (`battle.mp3`, `battle-2.mp3`, ...) in the first of `scopes` (folders, most specific first, e.g. `scenarios/x`, `campaigns/y`, `gameplay`) that has any, as urls in suffix order. `files`: path to url. `_pending/` paths are never used. */
export function musicTracks(files: Readonly<Record<string, string>>, slot: string, scopes: readonly string[]): string[] {
  const re = new RegExp(`^${slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:-(\\d+))?$`);
  for (const scope of scopes) {
    const hit: { n: number; url: string }[] = [];
    for (const [path, url] of Object.entries(files)) {
      if (path.includes('_pending/') || path.slice(0, path.lastIndexOf('/')) !== scope.replace(/\/$/, '')) continue;
      const m = re.exec(stem(tail(path)));
      if (m) hit.push({ n: m[1] === undefined ? 1 : Number(m[1]), url });
    }
    if (hit.length > 0) return hit.sort((a, b) => a.n - b.n).map((h) => h.url);
  }
  return [];
}

/** A random track, never `last` again when there is another. */
export function pickTrack(tracks: readonly string[], last?: string, random: () => number = Math.random): string | undefined {
  const rest = tracks.length > 1 ? tracks.filter((t) => t !== last) : tracks;
  return rest[Math.min(rest.length - 1, Math.floor(random() * rest.length))];
}

/** Slotted paths (not in `_pending/`) with no entry in `titles`: a game's test expects none. */
export function untitledTracks(files: Readonly<Record<string, string>>, titles: Readonly<Record<string, string>>): string[] {
  return Object.keys(files).filter((p) => !p.includes('_pending/') && !titles[p]);
}
