A React modal over the board and a confirm dialog built on it.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `Modal` + `ConfirmDialog`: show a modal dialog with keyboard focus, Tab containment and Escape ownership
<!-- /hooks -->

**What it does:** A React modal over the board and a confirm dialog built on it.

**You must:**
1. Own the `open` state: both dialogs only call `onClose` / `onCancel` / `onConfirm`, so set `open` false yourself after acting.
2. Give `title` always; give the dialog a `data-autofocus` control, else the first focusable one gets focus.
3. Pass `speed` from settings (default 1, 0 = instant fade).
4. Set the `--kc-modal-*` variables on `body` or an ancestor of the portal to match the game's look.
5. Use `closeOnBackdrop={false}` where an accidental click must not dismiss.
6. Keep nested dialogs in opening order. The last visible, non-inert dialog with `aria-modal="true"` owns Escape and Tab. Nonmodal dialogs leave this ownership with the modal. Escape also closes the modal from an embedded same-origin iframe in its content. Cross-origin and sandboxed opaque-origin frames handle their own key events. Background prompt/play keys and armed board picks pause while it is open.

**Common mistakes:**
- Leaving `open` true after `onConfirm`, `onCancel` or `onClose`: neither dialog closes itself, so it stays up.
- Setting the `--kc-modal-*` variables on the game's root element: the portal mounts in `document.body`, outside it, so they do not reach the dialog.



`Modal` takes `open`, `onClose`, `title`, `children` and optional `actions`.
Escape and backdrop clicks call `onClose`. Set `closeOnBackdrop={false}` to disable backdrop dismissal.
The portal mounts in `document.body` and locks body scrolling while open. The panel has `role="dialog"`, `aria-modal="true"` and an accessible name from its title. Focus goes to a visible, enabled `data-autofocus` target (a heading can use `tabIndex={-1}`), the first tab stop, or the panel. Tab and Shift+Tab wrap within the active dialog, with positive tabindex controls ordered before default tab stops. Disabled fieldsets exclude their controls except the native first-legend exception; editable regions participate in Tab order unless excluded by a negative tabindex, and nested editable regions need an explicit tab stop. Closing a nested dialog returns focus to its opener; closing a lower dialog does not steal focus from the active one. Only the active dialog handles Escape. Closed dialogs stay mounted under `hidden` and `inert`, so they do not suppress shortcuts.
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
