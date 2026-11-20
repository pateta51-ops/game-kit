# saves

Saved games in IndexedDB over engine-core's `SaveFile`, and a screen for them. `index.ts` draws nothing and loads in node; `ui/index.ts` (import `./ui`) holds the screen. Needs engine-core, small-helpers (`downloadText`) and the packages `idb-keyval`, `react`.

## Rules for agents

**What it does:** Saved games in IndexedDB (autosave slots, named saves, JSON export and import) over engine-core's `SaveFile`, and a screen to list, load, save and import them.

**You must:**
1. Install `idb-keyval` and `react` (needs `engine-core` and `small-helpers`); import the store from `index` (loads in Node) and the screen from `./ui`.
2. Create one store with `makeSaves({ game, content, database, filePrefix })`: `database` is the game's own IndexedDB name and `filePrefix` starts every export file name.
3. Call `saves.writeAutosave(history, name)` after every action; the store prunes to the newest `autosaves` (default 1).
4. Never mutate an action object after it is saved: the autosave cache matches actions by identity and applies only new ones.
5. Load only through `saves.restore(stored)` or the screen's `onLoad`; a save from another build or an edited file gives a reason, never a throw. Return a string from `onLoad` to show an error.
6. Give `<SavesScreen>` a `summary(state, save)` and the `history` it saves; a save that cannot load shows its reason and only Delete.
7. For export and import of all data, list every localStorage key (a prefix like `mygame.*` is allowed) and pass stores as `stores: { saves: saves.data }`; before `resetAllData`, put in-memory stores (settings `reset()`) back to defaults.
8. For an engine-port game pass the `EnginePort` as `game`; the save then holds the seed, content hash and answers. Saving an invalid port history throws "Cannot save an invalid game."

**Common mistakes:**
- Two games sharing one `database` name: they overwrite each other's slots.
- Expecting a save to load after the rules or content changed: it shows the reason and can only be deleted.
- Listing a key in `allData` that the game never writes as a string: only stored strings are exported.

## Store (`saves.ts`)

`makeSaves({ game, content, format?, database, table?, autosaves?, filePrefix, now?, backend? })`. `database` is the game's own IndexedDB name; `filePrefix` starts an export's file name.

- `writeAutosave(history, name)`: call after every action. Writes a new slot stamped later than every earlier autosave, also after the machine clock stepped back or another tab wrote one (the last stamp is stored under `SAVE_CLOCK`, read at every autosave and written with the slot: one transaction in IndexedDB, clock first on a backend without `setMany`; one that is not a time or is over a day ahead is ignored; a failed write goes to `onError`, else one console warning), then deletes the slots past the newest `autosaves` (default 1). Writing does not replay: a history that extends the last one saved applies only its new actions (K266); after an undo or another game it replays once. The cache matches actions by identity, so never mutate an action object after it is saved. `readAutosave()` gives the newest `[key, stored]`; `listAutosaves()`, `clearAutosaves()`.
- `saveNamed(name, history)`, `listNamed()` (newest first), `get(key)`, `remove(key)`, `rename(key, name)` (named saves only; false for an empty name or an unknown key).
- `exportText(stored)`, `exportName(stored)` (`<filePrefix>-YYYY-MM-DD-HH-MM.json`), `importNamed(text, name)`: the reason when the text does not load; nothing is stored then.
- `restore(stored)`: engine-core's `restoreSave` (replays; another build or an edited file gives the reason, never throws). `saveOf(history)` saves the actions up to the cursor; `historyOf(save)` gives the history back.
- `keepStorage(storage?)`: asks `navigator.storage.persist()` unless the storage is already kept; false when refused or not offered.
- `makeKv(database, table, backend?)`: the key-value table under it. When IndexedDB refuses, values last in memory for the page.
- `allData(cfg)`, `exportAllData(cfg, download?)`, `resetAllData(cfg)` (`data.ts`) with `cfg = { format, keys, stores?, storage? }`: one JSON of every localStorage key the game lists, its string as stored (a whole key or a prefix `mygame.*`) and of each named store's `read()`, downloaded as `<format>-YYYY-MM-DD.json`; the reset removes those keys and calls each store's `clear()`. Pass `stores: { saves: saves.data }`. `importAllData(cfg, text)` reads such a file back: refuses (`unreadable`, `wrong-format`, `newer-version` = version above 1), writes only listed keys (as the stored strings; listed keys missing from the file are left alone) and calls `write(value)` of each store that has one and is in the file; a failing write is skipped. Before a reset, put the stores in memory (settings: `reset()`) back to their defaults.

## Screen (`ui.ts`)

`<SavesScreen saves history canSave? summary onLoad words? className? download?>`: the autosave slots (the newest has Continue, others Load), a form that saves `history` under a name (empty: `words.unnamed`), the named saves, a JSON file import. Each row shows `summary(state, save)` from the game ("Game 4, 5 Season Points"), or the reason it cannot load with Delete only. `onLoad(save, key)` loads the game; a returned string is shown on the status line. `SAVES_WORDS` holds the default English words; `words` overrides any of them. Test ids: `save-row` (`data-slot` = key), `save-load`, `save-export`, `save-delete`, `save-name`, `save-new`, `save-note`, `save-import`, `no-autosave`.

## Look

`saves.css` (loaded by the screen) sets neutral values at zero specificity: `--sav-gap`, `--sav-text`, `--sav-font`, `--sav-bg`, `--sav-pad`, `--sav-border`, `--sav-radius`, `--sav-muted-opacity`, `--sav-bad`, `--sav-accent`, `--sav-accent-text`. Classes: `kit-sav`, `kit-sav-section`, `-list`, `-row`, `-what`, `-muted`, `-bad`, `-form`, `-btn`, `-primary`.

Tests: `saves.test.ts`, `data.test.ts`, `kv.test.ts` (node), `ui.test.tsx` (jsdom).

Long save names wrap (`overflow-wrap: anywhere`, `min-width: 0` on `.kit-sav-what`). Screen options: `confirmDelete` (Delete needs a second tap on the row; the button then reads `words.confirmDelete`), `renderImport(open, label)` (draws the import control; `open()` picks a file, the file input stays hidden). Each row's replay is computed once per stored save. `rename`: named saves get a Rename button (`save-rename`); the name becomes a text field (`save-rename-name`) and the button then reads `words.save`.

## Use it in 10 lines

```ts
import { makeSaves } from '../kit/saves/index'
import { newHistory } from '../kit/engine-core/kernel'
import { CONTENT, COUNTER, RULES, type Counter } from '../kit/engine-core/fake/counter'

const saves = makeSaves({ game: COUNTER, content: CONTENT, database: 'mygame', filePrefix: 'mygame' })
const history = newHistory<Counter>({ seed: 'demo' }, RULES)
const text = saves.exportText({ name: 'slot', save: saves.saveOf(history) }) // a file to download
console.log(text.length)
```

## A game behind an engine port

`game` also takes an engine-core `EnginePort` (K403; K419: any `PortTypes` game, its state no `KernelState`, needs no cast; `options`, `rules`, `action` default to `{ seed }`, `unknown`, `PortAnswer`; types `SaveOf`, `HistoryOf`): a save holds the seed (`options.seed`), the content hash (`contentHash` option, default engine-core's `hashValue` of the content) and the `PortAnswer`s in order. Restore is `start(seed)`, settle, then `portAnswer` for each; same slots, autosave, export/import and errors as with a `GameRules`. Tests: `port.test.ts`.

```ts
import { makeSaves } from '../kit/saves/index'
import { kernelPort, newHistory } from '../kit/engine-core/kernel'
import { CONTENT, COUNTER, RULES, type Counter } from '../kit/engine-core/fake/counter'

const port = kernelPort(COUNTER, CONTENT, { options: (seed) => ({ seed }), gameRules: RULES })
const saves = makeSaves<Counter>({ game: port, content: CONTENT, database: 'portgame', filePrefix: 'portgame' })
console.log(saves.saveOf(newHistory<Counter>({ seed: 'demo' }, RULES)).options)
```

## Button slots

```tsx
import { SavesScreen } from '../kit/saves/ui'
import type { Counter } from '../kit/engine-core/fake/counter'

export const Mine = (p: { saves: Parameters<typeof SavesScreen<Counter>>[0]['saves'] }) => (
  <SavesScreen<Counter> saves={p.saves} history={null} summary={(s) => String(s.counter)} onLoad={() => undefined}
    buttonClass="my-btn"
    renderButton={(b) => <button type={b.type} className={b.className} disabled={b.disabled} data-testid={b.testId} onClick={b.onClick}>{b.label}</button>} />
)
```

`buttonClass` is added to every button; `renderButton({ label, onClick, disabled, kind, className, type, testId })` draws a button instead (kind: load, export, rename, delete, save). Without them the screen is unchanged.
K391: `savedLine={false}` drops each row's "saved <date>" line, for a game whose summary already shows the date.

## Export and import all data

```ts
import { allData, importAllData, resetAllData } from '../kit/saves/index'

const cfg = { format: 'mygame-data', keys: ['mygame.*'] }
const text = JSON.stringify(await allData(cfg)) // what exportAllData downloads
await resetAllData(cfg)
console.log(await importAllData(cfg, text)) // { ok: true }; a store restores only if it has write()
```
