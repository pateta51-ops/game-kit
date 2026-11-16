# Saves, settings and app-frame wiring

Components: [`saves`](../../components/saves/README.md), [`settings`](../../components/settings/README.md), [`app-frame`](../../components/app-frame/README.md), [`resolution-frame`](../../components/resolution-frame/README.md), [`state-machines`](../../components/state-machines/README.md).

**Settings**
1. Declare a `SettingsSchema` as data (`toggle`, `choice`, `range`; `layoutSetting`, `resolutionSetting` helpers). `createSettingsStore(schema)` persists it (zustand); the settings screen is drawn from the schema.
2. A rules-conflict setting defaults to the designer's latest version (owner rule).

**Saves**
1. `makeSaves({ game, content, database, filePrefix })` over engine-core's `SaveFile`: `writeAutosave`, `saveNamed`, `listNamed`, `exportText` / `importNamed`, `restore`.
2. A history is engine-core's `History` (`newHistory`, `appendAction`, `undo`). The save holds options and actions, never a state snapshot you invent.
3. **No old-save fixing** until the game is complete (owner rule): a save from another build restores as `OLDER_BUILD`, never migrated by hand.
4. Crash screens: `<CrashScreen getSave>` from `app-frame` offers the save for download.

**Frame**
1. Route names in a `defineMachine` table; `parseHash`, `routeHref`, `follow` (a move checked against the machine).
2. `<AppFrame routes home .../>` with lazy `load` per route; each route has its own error boundary. `startApp(app, { root })` renders.
3. A fixed design stage (e.g. 3840x2160): `<Stage layout>`; `resolution-frame` scales it to the window (a Resolution setting). Phones: [phone-mode.md](phone-mode.md).

**Screen states** that are not engine state (dialogs, sheets) are explicit machines (`defineMachine`), not scattered flags.

Proof: the component tests' pattern (`ui.test.tsx` with jsdom) in your game; `node kit/kit.mjs check`.
