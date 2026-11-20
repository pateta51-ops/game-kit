Plain behaviour parts for four controls (Segmented, Toggle, Slider, TextField) that a game skins with its own CSS; no game look.

## Rules for agents

**What it does:** Behaviour-only Segmented, Toggle, Slider and TextField that a game skins with its own CSS.

**You must:**
1. Import from `kit/controls/ui`; the kit draws no look, so import `looks/plain.css` or style the `data-part` names yourself.
2. Give Slider `label`, `min`, `max`, `step`, `value` and `onChange`; keep `value` in state and store what `onChange` gives (already rounded to the step).
3. Style states from the attributes (`data-selected`, `data-checked`, `data-disabled`, `data-sub`) and the slider's `--fill`.
4. Mark a nested sub-setting with `<Toggle sub>`; the indent is `--controls-sub-indent`.
5. Use these parts instead of native browser selects, checkboxes and ranges where the look must be the game's own.

**Common mistakes:**
- Replacing the inner `data-part` elements with your own markup: the slider drag and the CSS hooks depend on them.
- A step that does not divide the range: the top value is the last whole step, not `max`.


## Use it in 10 lines

```tsx
import { useState } from "react";
import { Slider, Toggle } from "../kit/controls/ui";

export const Audio = () => {
  const [on, setOn] = useState(true);
  const [vol, setVol] = useState(0.3);
  return (
    <>
      <Toggle checked={on} onChange={setOn}>Sound</Toggle>
      <Slider label="Volume" min={0} max={1} step={0.1} value={vol} onChange={setVol} />
    </>
  );
};
```

- Each part has stable `data-part` names: `segmented`, `segment` (`data-selected`), `toggle` (`data-checked`), `toggle-track`, `toggle-knob`, `toggle-text`, `slider` (`--fill` percent, `data-disabled`), `slider-fill`, `slider-knob`, `text-field`.
- Roles: radiogroup/radio, checkbox, slider (drag, arrows, Home, End). The slider rounds to the step without float noise (step 0.1 gives 0.3).
- `Segmented` is generic over the option value. `TextField` is an `<input>` taking any native props.
- Optional `looks/plain.css` is minimal neutral styling so the parts work unskinned; a game styles the `data-part` names instead.
- Demo: `demo/index.html`.

K471: `<Toggle sub>` marks a nested sub-setting: it gets `data-sub`, and `looks/plain.css` indents it by `--controls-sub-indent` (default 1.6em).
