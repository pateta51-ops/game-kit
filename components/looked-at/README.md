# looked-at

Remember explicitly peeked cards by zone and show their faces again on demand.

`index.ts` loads in Node. Start with an empty array for each player's memory. `recordPeek` stores a card instance id, its zone, and a caller-supplied numeric marker such as an action number. A repeat peek replaces that card's entry and appends it to the end. `knownInZone` returns matches in recording order. Call `forgetCard` on each move or reveal, including a move within the same zone when it invalidates the peek. Store the array in the player's private save data. The functions return new arrays and preserve the input.

Mount `LookedAt` from `ui.ts` when the player asks to see the cards. Pass the remembered entries and a `renderCard` callback that renders the game's own face at its reading size, for example with card-parts. `onClose` lets the caller dismiss the view on Escape, the close button, or a click on the overlay outside the panel. `words.title` and `words.close` override the labels. Use `kla-overlay` to cover the click-away area, `kla-panel` for the dialog, and `kla-cards` and `kla-card` for the arrangement and size of the faces.

Reopen: keep `open` in the caller (default true), set it false in `onClose` and true on each new peek. While `open` is false and cards are remembered, passing `onReopen` shows a `kla-reopen` button (`words.reopen`, default "Show the cards again"). Zone: `zoneLabel(zone)` returns the words shown in a `kla-zone` span under each face; without it, or when it returns nothing, no zone text shows.

## Use it in 10 lines

```ts
import { forgetCard, knownInZone, recordPeek } from '../kit/looked-at/index';

const memory = recordPeek([], { cardId: "a", zone: "deck", when: 1 });
console.log(knownInZone(memory, "deck"));
console.log(forgetCard(memory, "a")); // []
```
