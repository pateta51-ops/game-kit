// UI fixtures: an invented content pack and invented art, to render card components without a private pack. Game-free:
// the game maps `FakeCard` onto its own card type. jsdom loads no images, so art is an SVG data URL (also fine in a browser).
export interface FakeCard {
  id: string;
  name: string;
  kind: string;
  text: string;
  art: string;
}
export interface FakePack {
  id: string;
  name: string;
  cards: FakeCard[];
}
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const hue = (s: string): number => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** A placeholder picture as an SVG data URL: a flat colour (same label, same colour) with the label centred. */
export function fakeArt(label: string, width = 240, height = 336): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="hsl(${hue(label)} 40% 55%)"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="${Math.round(width / 8)}" fill="#fff">${esc(label)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** An invented pack of `count` cards over `kinds` (default two), ids `fx-1`..; override any card by id. */
export function fakePack(opts: { count?: number; kinds?: string[]; id?: string; overrides?: Record<string, Partial<FakeCard>> } = {}): FakePack {
  const { count = 6, kinds = ['alpha', 'beta'], id = 'fixture' } = opts;
  const cards = Array.from({ length: count }, (_, i): FakeCard => {
    const cid = `fx-${i + 1}`;
    const kind = kinds[i % kinds.length] ?? 'alpha';
    return { id: cid, name: `Fixture ${i + 1}`, kind, text: `Invented text of card ${i + 1}.`, art: fakeArt(cid), ...opts.overrides?.[cid] };
  });
  return { id, name: 'Fixture pack', cards };
}
