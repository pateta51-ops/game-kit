# Earthborne Rangers motion settings

`src/ui/motion/effects.ts:164` and `src/ui/table/Board.tsx:76` turn upright card artwork clockwise on exhaust and back on ready. Use `tap` and `untap` with `dur: 450`, `angle: 90`, `overshoot: 6` and `ease: 'cubic-bezier(.4,.1,.3,1)'`. The overshoot frame uses offset .78. The original starts the next action after 130 ms. Pair with a move when the card centre changes. The exhaustion banner has its own scale and opacity sequence.


At `59e0ad1d`:

- `src/ui/index.css:45–55` uses `pulse` on each offered destination with `period: 1800` and `easing: 'ease-in-out'`. Frames are `[{}, { filter: 'drop-shadow(0 0 7px #deac42)', opacity: 0.65 }, {}]` so the ends use the element's own look. Stop when the decision closes.
- `src/ui/motion/motion.css:72–81` uses `idle` with `kind: 'bob', rise: 10, period: 2400, easing: 'ease-in-out'` on the resolving face. Stop when forward motion ends or is skipped. Scale both periods by the motion speed.
## Story reveal

Use `text` with `typewriter: { unit, progress, textAlign: 'inherit', rise: false }`. The game supplies its current story-reveal setting (`'word'` or `'letter'`) and its normalized narration progress. At word pace, a whole word appears as soon as its first letter is due. Whitespace advances with its neighbours. The text keeps its layout.

Without narration, each paragraph's progress is elapsed reading time divided by `Math.max(700, wordCount * 60000 / 220)`. Use that duration per paragraph, or let the game provide the progress callback for a narration fallback or an adopted voice. The original book starts reading after the opening animation (700 ms at normal speed), advances one paragraph at a time, and retains full text after skip. The game owns paragraph order, voice, rich-text decorations, book opening, and the live end state.

Source: `src/ui/motion/book.ts` at `59e0ad1d` (reading clock, unread highlight and paragraph sequencing).

### Backdrop drift

From `src/ui/motion/motion.css` at `59e0ad1d`. Call `startIdle`
on the blurred backdrop alone, with the settings below. A 48000 ms
round trip matches the 24000 ms alternating animation. Use speed 1
in Normal and Fast, and stop the loop when motion is switched off.

```ts
{ kind: 'drift', drift: { x: 8, y: -5, scale: 1.012 },
  period: 48000, easing: 'ease-in-out' }
```
