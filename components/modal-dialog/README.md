A React modal over the board and a confirm dialog built on it.

`Modal` takes `open`, `onClose`, `title`, `children` and optional `actions`.
Escape and backdrop clicks call `onClose`. Set `closeOnBackdrop={false}` to disable backdrop dismissal.
The portal mounts in `document.body` and locks body scrolling while open. Focus goes to `data-autofocus`, the first focusable control, or the panel, and returns to the opener on close.
`ConfirmDialog` takes the same open, title, backdrop and speed props, plus `message`, `confirmLabel`, `onConfirm`, `onCancel`, optional `cancelLabel` (defaults to Cancel) and `danger`. Escape and backdrop dismissal call `onCancel`. The caller updates `open` after acting.
`speed` scales the fade duration (default 1, 0 for instant).

## Look

Set these properties on `body` or an ancestor of the portal. Each name below starts with `--kc-modal-`.

- Overlay and motion: `backdrop`, `z-index`, `gutter`, `duration`.
- Panel: `width`, `padding`, `gap`, `border`, `radius`, `surface`, `text`, `shadow`, `font`, `title-font`.
- Actions: `action-gap`, `button-padding`, `button-border`, `button-radius`, `button-surface`, `button-text`, `confirm-surface`, `confirm-text`, `danger-surface`, `danger-text`.

## Use it in 10 lines

```tsx
import { useState } from 'react';
import { ConfirmDialog } from '../kit/modal-dialog/ui.tsx';

export function Reset({ reset }: { reset: () => void }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Reset</button>
    <ConfirmDialog open={open} title="Reset board?" message="Your current turn will be cleared."
      confirmLabel="Reset" danger onConfirm={() => { reset(); setOpen(false); }} onCancel={() => setOpen(false)} />
  </>;
}
```
