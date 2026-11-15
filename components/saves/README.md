# saves

Saved games in IndexedDB over engine-core's `SaveFile`, and a screen for them. `index.ts` draws nothing and loads in node; `ui.ts` holds the screen. Needs engine-core, bug-reporter (`downloadText`) and the packages `idb-keyval`, `react`.

## Store (`saves.ts`)

`makeSaves({ game, content, format?, database, table?, autosaves?, filePrefix, now?, backend? })`. `database` is the game's own IndexedDB name; `filePrefix` starts an export's file name.

- `writeAutosave(history, name)`: call after every action. Writes a new slot, then deletes the slots past the newest `autosaves` (default 1). `readAutosave()` gives the newest `[key, stored]`; `listAutosaves()`, `clearAutosaves()`.
- `saveNamed(name, history)`, `listNamed()` (newest first), `get(key)`, `remove(key)`.
- `exportText(stored)`, `exportName(stored)` (`<filePrefix>-YYYY-MM-DD-HH-MM.json`), `importNamed(text, name)`: the reason when the text does not load; nothing is stored then.
- `restore(stored)`: engine-core's `restoreSave` (replays; another build or an edited file gives the reason, never throws). `saveOf(history)` saves the actions up to the cursor; `historyOf(save)` gives the history back.
- `keepStorage(storage?)`: asks `navigator.storage.persist()` unless the storage is already kept; false when refused or not offered.
- `makeKv(database, table, backend?)`: the key-value table under it. When IndexedDB refuses, values last in memory for the page.

## Screen (`ui.ts`)

`<SavesScreen saves history canSave? summary onLoad words? className? download?>`: the autosave slots (the newest has Continue, others Load), a form that saves `history` under a name (empty: `words.unnamed`), the named saves, a JSON file import. Each row shows `summary(state, save)` from the game ("Game 4, 5 Season Points"), or the reason it cannot load with Delete only. `onLoad(save, key)` loads the game; a returned string is shown on the status line. `SAVES_WORDS` holds the default English words; `words` overrides any of them. Test ids: `save-row` (`data-slot` = key), `save-load`, `save-export`, `save-delete`, `save-name`, `save-new`, `save-note`, `save-import`, `no-autosave`.

## Look

`saves.css` (loaded by the screen) sets neutral values at zero specificity: `--sav-gap`, `--sav-text`, `--sav-font`, `--sav-bg`, `--sav-pad`, `--sav-border`, `--sav-radius`, `--sav-muted-opacity`, `--sav-bad`, `--sav-accent`, `--sav-accent-text`. Classes: `kit-sav`, `kit-sav-section`, `-list`, `-row`, `-what`, `-muted`, `-bad`, `-form`, `-btn`, `-primary`.

Tests: `saves.test.ts`, `kv.test.ts` (node), `ui.test.tsx` (jsdom).
