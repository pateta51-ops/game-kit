# drag-drop
Drag a source onto a target, both option ids of the open prompt: a drop answers exactly as tap source then tap target through prompt-host `useBoardPick` (so through game-store: one drop, one click, one undo step). Unstyled; structural CSS only on the ghost (fixed, no pointer).

## Rules for agents

**What it does:** Drag a source onto a target, both option ids of the open prompt; a drop answers exactly as tap source then tap target (one answer, one undo step).

**You must:**
1. Pass a prompt-host `useBoardPick` result as `pick` and the prompt's id as `promptId`.
2. Spread `drag.sourceProps(optionId)` on each source, put `data-drop="<optionId>"` on each target, and wrap the board in `onClickCapture={drag.onClickCapture}`.
3. Render `<DragGhost drag={drag} render={...}/>` so the dragged item is seen.
4. Pass `speed` from settings (0, `'instant'` or reduced motion: no glide) and `enabled` from the drag setting.
5. Override `taps(source, target)` when the answer is not `[source, target]` (a click on the source alone answers: `taps: (s) => [s]`).
6. For composite option ids pass `sourceLegal` and `taps: (s, t) => [t + ':' + s]`.
7. Put `data-drop-block` on an element (a hand fan) that must not be a target.
8. Style by `data-drop-state` (`legal`, `over`), `data-drag` and `[data-part="ghost"]`; only the ghost gets structural CSS.

**Common mistakes:**
- A source whose option is not legal never starts a drag.
- Waiting for the animation before answering: the answer is sent at the drop.
- A move under 8 px is a click, not a drag.


- Source: any element with `{...drag.sourceProps(optionId)}` (`data-drag`, the press); it drags only while its mark is legal and the setting `enabled`. A move under 8 px stays a click; after a drag the click is swallowed.
- Target: any element with `data-drop="<optionId>"`. While dragging, legal targets carry `data-drop-state="legal"`, the one under the pointer `"over"`. A target is legal when every tap of `taps(source, target)` is legal in the prompt (default `[source, target]`, e.g. a `max: 2` prompt; a game whose click on the source alone answers passes `taps: (s) => [s]`). `data-drop-block` on an element (the hand's fan) makes everything under it no target.
- Composite option ids (`slotA:c1`, a slot and a card together): the dragged card is no option, so pass `sourceLegal: (id) => id.startsWith('c')` (or a check on the legal options) and `taps: (s, t) => [t + ':' + s]`; it decides who may start a drag and whether the drag stays legal, `taps` still decides targets and the answer (`['slotA:c1']`). Without `sourceLegal` the source's own mark decides.
- Cancel: Escape, a lost pointer, no button down, a new prompt id, or the source no longer legal. While dragging, the keys 1-9, E, Enter, Space do nothing.
- Animation (Web Animations): illegal drop or cancel: the ghost glides back to the source (`[data-drag]` of its id); legal drop: it settles onto the target. `speed` divides the 180 ms; 0, `'instant'` or prefers-reduced-motion: none. The answer is sent at the drop, never after the animation.
- Look hooks: `[data-part="ghost"]` with `data-flight` (`drag`, `back`, `settle`) and `data-source`; `data-drop-state`; `data-drag`. `gesture.ts` (node, `index.ts`) is the pure reducer.

## Use it in 10 lines
```tsx
import { useDragDrop, DragGhost } from '../kit/drag-drop/ui'
import { useBoardPick } from '../kit/prompt-host/ui'

export function Board({ prompt, answer }: { prompt: Parameters<typeof useBoardPick>[0]; answer: Parameters<typeof useBoardPick>[1] }) {
  const pick = useBoardPick(prompt, answer, { confirm: false })
  const drag = useDragDrop({ pick, promptId: prompt?.id, taps: (s, t) => [s, t], speed: 1 })
  return <div onClickCapture={drag.onClickCapture}><button {...drag.sourceProps('card')} onClick={() => pick.tap('card')}>Card</button>
    <div data-drop="slot" /><DragGhost drag={drag} render={(id) => <b>{id}</b>} /></div>
}
```
