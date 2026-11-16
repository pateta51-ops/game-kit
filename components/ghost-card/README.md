# ghost-card

A prompt choice whose source card has left play (an "after this is discarded" trigger) has no card on the table to
hang its button on. `ghostChoices` splits the choices: those the table shows, and one group per absent source with
the card as it last was, which the screen draws as a ghost card (a modal or a side slot) carrying those buttons.

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
