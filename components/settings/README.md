# settings

Settings declared as data, a persisted store of their values and a screen drawn from them. The game keeps its keys, words, sections and the frame around the screen. Needs the packages `react` and `zustand`. `index.ts` draws nothing and loads in node; `ui/index.ts` (import `./ui`) holds the screen.

## Schema (`schema.ts`)

`{ storageKey, version?, sections: [{ id, title, settings }] }`. A setting is a slider `{ kind: 'range', key, label, min, max, step?, default, hint?, dev? }` (a number; the screen's `onRelease(key, value)` fires when it is let go, so the game plays a sample at the new level) or a toggle `{ kind: 'toggle', key, label, default, hint?, dev? }` or a choice `{ kind: 'choice', key, label, options: [{ value, label, line? }], default, hint?, dev?, select? }` (values are strings or numbers; `select` draws a drop-down). Write the schema `as const satisfies SettingsSchema` and `Values<typeof schema>` types every key.

- `defaults(schema)`, `readSettings(schema, raw)`: a stored value is kept only when it is a boolean (toggle) or one of the options (choice); anything else, or a missing key, is the default.
- `layoutSetting(key, label, words, def?)`: a choice of `auto`, `phone`, `desk`, the values phone-mode's `layoutModeFor` reads. A game passes it to phone-mode's viewport as `setting: () => store.getState().values.layout` and `onSetting: (f) => store.subscribe(f)`.
- `resolutionSetting(key, label, windowWord, def?, sizes?)`: a drop-down of screen sizes `WxH` (labels `W × H`, default `3840x2160`) and `window`; `resolutionSize(v)` gives `{ w, h }` or null.

## Store (`store.ts`)

`createSettingsStore(schema, storage?)`: a zustand store `{ values, set(key, value), reset(keys?) }`, persisted as JSON under `storageKey` and read back through `readSettings`. `reset()` with no keys also resets the `dev` settings the screen hides. The default storage is `safeStorage` (localStorage with every call guarded: blocked storage keeps the values for the session).

## Screen (`ui.ts`)

`<SettingsScreen schema store dev? className?>`: one fieldset per section, named by its heading; a checkbox per toggle, a radio group (or a drop-down) per choice, the hint and each option's line under it. Each change writes the store at once. Settings with `dev` show only when `dev` is set; a section with nothing shown is left out. Ids come from `useId`, so two screens never share one. Test ids: `setting-<key>`, `setting-<key>-<value>` for a radio.

## Look

`settings.css` (loaded by the screen) sets neutral values at zero specificity: `--set-gap`, `--set-text`, `--set-font`, `--set-pad`, `--set-border`, `--set-radius`, `--set-bg`, `--set-row-gap`, `--set-title-font`, `--set-title-color`, `--set-label-weight`, `--set-hint`, `--set-hint-opacity`, `--set-accent`. Classes: `kit-set`, `kit-set-section`, `-title`, `-row`, `-choice`, `-label`, `-option`, `-hint`.

Tests: `settings.test.ts` (node), `ui.test.tsx` (jsdom).

`look="plates"` (with `onOff` labels, default On/Off): each toggle or choice option is a button (`aria-pressed`, class `kit-set-plate-on` when chosen), no checkbox or radio; test ids `setting-<key>-on|off` and `setting-<key>-<value>`; drop-downs stay. `showLine` (default off) adds the chosen option's `line` under the plates, class `kit-set-line`, test id `setting-<key>-line`.

`extra` (`{ [sectionId]: ReactNode }`): custom rows drawn inside that section's fieldset after its settings; a section with only an extra still shows. `children` draw after the last section. A game no longer portals into the screen by title text.
