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
