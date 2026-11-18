Unstyled, data-driven main menu and new-game set-up form, with a pure default and validate model.

Words are passed in (`words`, English defaults); no CSS: plain elements with `data-part`, `data-field`, `data-entry` and `className`.

## Use it in 10 lines

```ts
import { defaultSetup, validateSetup, type SetupSpec } from '../kit/screens/index'

const spec: SetupSpec = {
  seats: { min: 1, max: 4, kinds: [{ value: 'human', label: 'Human' }, { value: 'bot', label: 'Bot' }] },
  scenarios: [{ value: 'a', label: 'A' }],
  difficulties: [{ value: 'easy', label: 'Easy' }],
}
const setup = defaultSetup(spec)
console.log(setup, validateSetup(spec, setup))
```

UI (`ui.ts`): `<MainMenu entries={[{ id: 'continue', label: 'Continue', disabled: true }]} onSelect={id => ...} />` and `<SetupForm spec={spec} onStart={setup => ...} />`. `onStart` gets `{ seats: [{ kind, name? }], scenario, difficulty, ...extra }`, only when valid; `validateSetup` returns the failing field names (`seats`, `seat-kind`, `scenario`, `difficulty`, or an extra key).

Seams: a `MenuEntry.label` may be any `ReactNode` (two-line entry with an icon). `SetupForm` takes `value` + `onChange` for controlled use (uncontrolled stays default), `submit={false}` to leave out its Start button and `id` so the game's own `<button type="submit" form={id}>` elsewhere starts the game, and `renderField(field, value, set)` to draw a scenario, difficulty, extra or select-many field yourself (return `undefined` for the default). `SetupSpec.seats` is optional: leave it out for a solo game (no seat count or names; `setup.seats` is `[]`). `SetupSpec.many` lists select-many fields `{ key, label, options, min?, max?, default? }`: a checkbox group that keeps min/max, value `string[]`; `validateSetup` returns the key when out of range.
