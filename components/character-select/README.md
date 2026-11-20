A character select screen before a game: roster by set, hero, deck browser, track slot, opponent strip, modes, folded options and Begin; the game supplies the data, slots and look.

## Use it in 10 lines

```tsx
import { CharacterSelect, type Character } from "../kit/character-select/ui";
import "../kit/character-select/looks/layout.css";

const roster: Character[] = [
  { id: "ada", name: "Ada Quill", set: "core", stat: 2, summary: "Gains [coin] from every <FRIEND>." },
  { id: "bram", name: "Bram Holt", set: "core", stat: 5 },
];

export const Select = () => (
  <CharacterSelect roster={roster} sets={[{ id: "core", label: "Core box" }]} opponents={roster} onBegin={(c) => console.log(c)} />
);
```

## Data

- `roster`: `Character` (`id`, `name`, `short`, `set`, `stat` 0..`statMax` for the meter, `statLine`, `meta`, `summary`, `full`, `links`, `portrait`, `deck`). Give it in the order to show; `sortRoster(list, sets)` orders by set, then stat. The roster groups by `sets` (`{ id, label }`).
- `opponents`: `Opponent` (`id`, `name`, `statLine`, `meta`, `summary`, `full`, `portrait`). By default the character picked cannot be its own opponent; `canOppose(id, choice)` replaces that rule (`{ ok, why }`, `why` is the tooltip). `canPick(id)` does the same for the roster.
- `modes`: tabs (`id`, `label`, `line` beside the options toggle; `opponents: false` replaces the strip with `note`). One mode shows no tabs.
- `fields`: the folded "Game options" (`select` with `choices` and a `disabled` reason, `text`, `check`; `modes` limits a field to some modes). `initial` sets the first `mode`, `pick`, `opponent` and `options`.
- `onBegin(choice)` gets `{ mode, pick, opponent, options }` (no opponent in a mode without one; options of fields hidden in the mode are dropped). The game builds its own new-game options from it. `onChange` reports every change; `problems(choice)` returns reasons that disable Begin and show beside it.

## Text, cards and portraits

- `summary` and `full` take `[name]` icons (only names in `icons`), `<NAME>` chips and the phrases of `links` (each linked once, the longest first; a link is a button with `data-card`, reported to `onCard`). `renderGlyph(piece)` draws an icon or chip; `pieces(text, icons, links)` is the parser. The full text opens on hover or on the "Full text" button (tap).
- `deck`: `{ id, name, kind }`. Tabs: All, then each kind in `kindOrder` (others after) with counts, labelled by `kindLabel`; search by name; pages of `perPage` (default 5, phone 3). `renderCard(card)` draws a card; a card click goes to `onCard`.
- `portrait`: `{ src, focus }` covers the box with the image at the focus point; add `crop: { width, ratio, bottom, top, faceAt }` to cut a region (a card's art box) out of a larger image fitted to the box's real aspect (`portraitCrop`).

## Slots and words

`slots`: `frame(screen)` wraps the screen, `header` sits above the mode tabs, `plate(c, where)` replaces the name plate in `roster`, `hero` or `opponent`, `track(c, choice)` is the game's own panel under the deck (a board, a ladder), `sub(c, choice)` a sub-picker in the hero (a board side). `words` replaces the labels (roster title, deck heading, search, tabs, pager, opponent heading, options, Begin, full-text toggle). `phone` sets `data-layout="phone"`.

## Look

Import `looks/layout.css`. Every part has a `data-part`; the screen is `[data-part="character-select"]` with `data-layout` and `data-mode`. Colours and fonts are variables with neutral defaults: `--cs-bg`, `--cs-panel`, `--cs-edge`, `--cs-text`, `--cs-muted`, `--cs-accent`, `--cs-on`, `--cs-begin-bg`, `--cs-begin-text`, `--cs-font`, `--cs-label-font`, `--cs-radius`; sizes `--cs-u` (the unit, a share of the viewport), `--cs-gap`, `--cs-roster-w`, `--cs-hero-w`, `--cs-bottom-h`, `--cs-card-ratio`. Wide: header across, roster left, hero, deck and track right, opponents and Begin along the bottom. Phone: one column, a horizontal roster strip, Begin pinned to the bottom.

Demo: `demo/` (a made-up game); `demo/shots.mjs` makes the contact sheets `demo/sheet-4k.png` and `demo/sheet-phone.png`.
