Plain behaviour parts for four controls (Segmented, Toggle, Slider, TextField) that a game skins with its own CSS; no game look.

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
