Unstyled, data-driven main menu and new-game set-up form, with a pure default and validate model, plus reusable frames for non-table screens.

Words are passed in (`words`, English defaults); the menu and setup form load no CSS: plain elements with `data-part`, `data-field`, `data-entry` and `className`.

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

Seams: `MainMenu bare` renders the entry buttons with no wrapping `nav` (each keeps `data-entry`, `className` goes on every button), so a game places each one in its own layout zone. A `MenuEntry.label` may be any `ReactNode` (two-line entry with an icon). `SetupForm` takes `value` + `onChange` for controlled use (uncontrolled stays default), `submit={false}` to leave out its Start button and `id` so the game's own `<button type="submit" form={id}>` elsewhere starts the game, and `renderField(field, value, set)` to draw a scenario, difficulty, extra or select-many field yourself (return `undefined` for the default). `SetupSpec.seats` is optional: leave it out for a solo game (no seat count or names; `setup.seats` is `[]`). `SetupSpec.many` lists select-many fields `{ key, label, options, min?, max?, default? }`: a checkbox group that keeps min/max, value `string[]`; `validateSetup` returns the key when out of range.

## Screen frame (K360)

Pass the back link or button, header actions and footer as nodes. Each part has a `kit-scr-*` class. Override frame classes by part with `cls`, or pass a class string to the footer or toggle. Import `looks/frame.css` for an optional layout with `--scr-gap`, `--scr-width`, `--scr-height`, `--scr-pad` and `--scr-footer-border`.

Create one theme store at app startup with a game-specific storage key. It applies the saved choice or the fallback (default `system`) to `html[data-theme]` and keeps the choice in memory if storage fails. A third argument renames the attribute (default `data-theme`). In system mode the store also sets `data-theme-resolved` (`light` or `dark`, the attribute name plus `-resolved`), follows OS changes, and `store.destroy()` removes the OS listener; the optional CSS keys on the resolved value. The footer passes extra props (e.g. `data-testid`) to the disclaimer paragraph; the back action has no default, the game passes it. The toggle cycles system → light → dark → system and shows the next choice. Footer text and toggle labels come from the game. Use the disclaimer helper for neutral English wording or pass your own text.

```tsx
import { createThemeStore, disclaimer } from '../kit/screens/index';
import { Footer, ScreenFrame, ThemeToggle } from '../kit/screens/ui';

const store = createThemeStore('example.theme');
const words = { light: { label: 'Light theme' }, dark: { label: 'Dark theme' }, system: { label: 'System theme' } };
const footer = <Footer gameName="Example" stamp="Build 12" disclaimer={{ text: disclaimer('Example', 'Example Press') }} />;

export const Settings = () => (
  <ScreenFrame title="Settings" back={<a href="#/">Home</a>} actions={<ThemeToggle store={store} words={words} />} footer={footer}>
    <p>Game preferences</p>
  </ScreenFrame>
);
```
