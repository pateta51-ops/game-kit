# ghost-card

A prompt choice whose source card has left play (an "after this is discarded" trigger) has no card on the table to
hang its button on. `ghostChoices` splits the choices: those the table shows, and one group per absent source with
the card as it last was, which the screen draws as a ghost card (a modal or a side slot) carrying those buttons.

## Rules for agents

**What it does:** Splits a prompt's choices into those the table shows and one group per absent source (a card that left play), to draw as a ghost card carrying the buttons.

**You must:**
1. Call `ghostChoices(choices, sourceOf, onBoard, snapshotOf, key?)` with the open prompt's choices.
2. `sourceOf(c)` returns an id or an engine-core `ObjectRef`, or undefined for pass and rule actions.
3. `onBoard(r)` says whether the source is on the table now (with refs: `isCurrent` and in a table zone).
4. `snapshotOf(r)` returns the card as last seen (engine-core `lastKnown(state, r)?.obj`).
5. Draw each ghost yourself, dimmed, with its `choices` as buttons (a stand-in when `snapshot` is undefined).

**Common mistakes:**
- Drawing only the `onTable` choices: the ghost choices then have no button anywhere.


| Argument | What the game passes in |
|---|---|
| `choices` | The open prompt's choices. |
| `sourceOf(c)` | The choice's source: an id or an engine-core `ObjectRef`; undefined for none (pass, a rule action). |
| `onBoard(r)` | Is that source on the table now? With refs: `isCurrent(state, r)` and in a table zone. |
| `snapshotOf(r)` | The card as it last was: `lastKnown(state, r)?.obj` (engine-core K113). |
| `key(r)` | Optional: how sources group (default `JSON.stringify`). |

```ts
const { onTable, ghosts } = ghostChoices(prompt.choices, (c) => c.source, (r) => isCurrent(s, r) && inPlay(s, r.id),
  (r) => lastKnown(s, r)?.obj);
// draw each ghost: the card face of g.snapshot (or a stand-in when undefined), dimmed, with g.choices as its buttons
```

Pairs with `prompt-gallery` `checkActionCoverage`: a choice that no table control sends is the case this fixes.
Not here: the drawing (the game's card face and modal), which choice is legal, and keeping the snapshot (engine-core).

## Use it in 10 lines

```ts
import { ghostChoices } from '../kit/ghost-card/index'

type Choice = { id: string; source: string }
const choices: Choice[] = [{ id: '1', source: 'a' }, { id: '2', source: 'gone' }]
const split = ghostChoices(choices, (c) => c.source, (src) => src === 'a', (src) => ({ lastKnown: src }))
console.log(split.onTable.length, split.ghosts[0]?.snapshot)
```
