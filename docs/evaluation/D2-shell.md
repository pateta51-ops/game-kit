# D2 Menus shell and phone mode (read-only; counts from scripts, nothing run)

Test counts are it()/test() cases in files whose names match the piece; "none" = no matching test file.
Not checked: ebr Proof/Saves screens in depth, unst offline (it has none), CSS of each phone layout, jarl public/sw.js (public/ is not in the export).
Score order: Generic / Tested / Proven / Fixes / Complete / Seams (0-3).

## A. MENUS SHELL

### A1 Settings (store + screen)
- stcc 3/1/2/2/3/2. Store has 0 game imports but 35 keys; e2e only, no store unit test.
- warps 1/0/2/1/2/1. Settings.tsx imports art, presentation, bag3d, table (5 game imports); no tests.
- rome 2/1/2/3/3/2. Store imports engine (1) and frame/resolution; readSettings validates stored JSON per key; Resolution test; owner 11 Nov.
- jarl 2/1/3/2/2/3. 1 engine import (UndoMode), 7 keys incl. Layout (auto/phone/desk) and phone menu top/bottom; e2e menus.spec 399 lines; owner-confirmed on phone.
- imp 2/3/2/3/3/2. 24 cases (settingsStore.test 242 lines, Settings.test); settingsWords.ts keeps screen words apart; 37 keys; imports play/answers.
- unst 3/3/2/1/1/3. 2 keys, 0 imports, 55 cases over small separate stores (settings, play, sound).
- ebr 1/0/2/2/2/1. 83 keys, imports content/schemas, selection, engine; no tests found.
Features: validating reader with defaults (rome, imp, unst); one store per concern (unst); words separate from code (imp); Layout setting (jarl); PC Resolution (rome); sound settings (unst); bug-report switch (all, via bugs/BugSettings).
Verdict: Base imp (tested store, validated reader, words file). Graft jarl Layout setting and rome Resolution. Parameterise every game-specific key; keep the pattern defaults + validating reader + zustand store + one storage key. Lift M. Share store and form pieces; screens are game-themed. Risks: none.

### A2 Saved games
- stcc 2/1/3/2/2/2. Store imports content/save only; rename, autosave binding; persistence e2e 103 lines.
- warps 2/3/3/3/3/2. saves.test 270 lines (15 cases) plus saves.spec; asks browser to keep storage; deleteSave, exportName.
- rome 2/3/3/3/2/2. 9 cases plus golden history-save test plus saves.spec; storage-persist; importSaveText.
- jarl 2/2/3/3/3/3. IndexedDB via a small kv wrapper; named saves, import, older-build flagged for deletion, tutorial marker beside autosave; save = (version, options, rules, actions, hash, undoUsed) sealed against editing the undo flag; 4 cases plus persistence scenario 161 lines plus e2e.
- imp 1/3/3/3/3/1. 54 cases (saves.test 390 lines), persistence test, content/save test; 4 engine/content imports plus pack hook and legacy-hash migration.
- unst 2/3/2/2/2/2. 23 cases (persistence.test 293) plus e2e.
- ebr 1/3/3/3/3/1. 43 cases (b7-saves 391, u30 autosave slots 195); several autosave slots with pruning, legacy autosave migration, separate campaign save.
Features: single autosave (all); rotating slots with pruning (ebr); named saves (stcc, warps, jarl, imp); rename (stcc); delete (warps, jarl); export/import file (warps, rome, jarl, imp); ask browser to keep storage (warps, rome); older-build saves flagged (jarl, rome); migration (imp, ebr); tamper seal (jarl); IndexedDB (jarl, ebr) vs localStorage (rest).
Verdict: Base jarl (IndexedDB wrapper, one clean save shape, newest, but only 4 unit cases). Graft warps saves.test (15 cases) and storage-persist call, rome golden save test, ebr slot pruning. Parameterise: engine types (SaveFile, restoreSave) become a generic interface (version, payload, hash); drop the tutorial marker. Lift M.
Risks: determinism-critical: replay must reproduce the final hash; keep the seal. Owner rule: old saves need not load, so no migration code in the kit.

### A3 Offline install (PWA)
- stcc 2/3/3/3/2/2. offline.ts imports card image cache and session (launch hook); offline.test 42, tests/scripts/offline-sw 72, e2e 60; looks in card-photo caches first.
- warps 3/2/3/2/2/3. 0 game imports (157 lines); 4 cases plus e2e.
- rome 3/2/2/3/2/3. 0 imports (43 lines); 3 cases plus e2e; page asks skip-waiting, never automatic.
- jarl 3/3/3/3/3/3. sw.ts imports only the machine helper; precache plugin scripts/lib/sw-precache.ts versions the list by file contents; pure shouldRegister(env, where, supported); 8 cases plus offline e2e 134 lines with a local offline server lib; update line on Home via update machine; HTTPS only, never dev or e2e; drops old caches by prefix; excludes art/orig.
- imp 3/2/2/2/2/3. 0 imports; 8 cases plus tests/scripts/offline-sw.
- unst: none. ebr 1/2/2/2/2/1: tied to scan image cache and art etags; scan-cache-sw test 130 lines.
Note: stcc, warps, rome, imp write the same service worker as a string inside vite.config.ts (copies with small differences); jarl moved it to a plugin file.
Features: precache by build (all but unst); content-hash version (jarl); update banner (jarl); skip-waiting on request (rome, jarl); persistent storage request (warps, rome); no registration in frames (stcc, rome); image cache (stcc, ebr); offline e2e against a real server (jarl).
Verdict: Base jarl. Graft warps persist() request; stcc card-photo cache as an optional hook. Parameterise CACHE_PREFIX, exclusion list, Home wiring of the update line. Lift S to M. Risks: none (no LOTR code here).

### A4 Proof sheet
- stcc 1/3/3/3/3/2 (571 lines, imports describeBotRow, describeCard, crew ids; pure proofFilters/proofGroups with 269-line test; proof.spec 148).
- warps 2/2/2/2/2/2 (9 cases). rome 2/0/2/2/1/3 (rows as data in proofRows.ts). jarl 2/0/2/2/1/2.
- imp 1/3/2/2/3/2 (11 cases, 304-line test, proofSections.ts). unst 1/3/2/2/3/1 (33 cases). ebr 2/2/2/2/2/2.
Verdict: pattern only. Screens draw each game own faces and describe functions. Take stcc proofFilters.ts and proofGroups.ts (pure, well tested) and the rome rows-as-data idea; a generic list-with-filter shell taking a renderer is Lift M.

### A5 App frame
- stcc 2/2/3/3/2/2. ErrorBoundary 40 lines, generic; ScreenFrame is Starfleet-themed; 5 route cases.
- warps 2/2/3/1/1/2. Only a 3D PictureBoundary. rome 2/2/2/1/1/2: MenuFrame, no boundary.
- jarl 3/2/3/1/2/3. routes.ts 69 lines over routes.machine.ts (named events: noGame, unreadable, gameEnded, started); no ErrorBoundary; main.tsx test hook window.jarl for e2e.
- imp 2/3/3/3/3/2. Lazy screens with Suspense and Loading, ErrorBoundary identical to stcc, routes.test 36 cases.
- unst 2/3/2/1/1/2 (18 cases). ebr 1/0/2/2/2/1 (ErrorPanel, App 107 lines).
Verdict: Base imp (lazy screens, boundary, route tests); graft jarl routes.machine.ts and the e2e hook. ScreenFrame/MenuFrame are themed: pattern only (logo, title, back link, nav list). Lift M.

### A6 Dev server and phone preview scripts
stcc, warps, rome, imp have a phone script: build then vite preview --host 127.0.0.1 on a fixed port (imp 4173, stcc 4174, warps 4175, rome 4176; stcc and imp link assets first). jarl has play on 4178. ebr and unst have only dev/preview. Verdict: pattern only, a two-line script; keep one port per game in a kit list. Lift S.

## B. PHONE MODE
Counts: jarl phone 16 files + viewport 5 + fit.ts, 26 imports out into engine/content/game/store, 74 cases plus about 10 phone e2e specs. imp board/phone 22 files, 21 out-imports, 124 cases, phone.spec 925 lines. stcc 13 files, 19 out-imports, 33 cases, 4 phone e2e specs. warps 11 files, 20 out-imports, 23 cases. rome: no phone layout, only a 69-line phone.css (max-width 600 reflow), 5 cases; it has the Resolution frame instead.
Scores: jarl 2/3/3/3/3/3; imp 2/3/2/2/2/2; stcc 2/2/2/2/1/2; warps 2/2/2/2/2/1; rome 3/1/2/1/1/3 (Resolution only).
Evidence jarl: owner confirmed on iPhone 16e on 10 Nov (docs/PROGRESS.md, SESSION_HANDOFF.md, docs/decisions/PHONE-mock-verdicts.md); follow-ups #22-#24 fixed real-device bugs.
Fixes only jarl carries: html/body/#root height 100% and 100dvh fixed layers (#23); removed viewport-fit=cover, apple-mobile-web-app-capable and black-translucent meta, which caused a 47 pt band under the dock in the Home Screen app (#24); phone test = touch pointer and short side <= 500 px (stcc uses width <= 700 and warps width <= 600 only, so a narrow desktop window gets the phone layout there); follows the window, so rotation loses nothing.
Features: layout mode decision (jarl pure function; others media query); override (jarl setting; ?layout= in stcc, warps); landscape (jarl turn-upright panel; warps own landscape layout); safe-area tokens with test hook (jarl); fit-zoom of 4K screens (jarl); PC Resolution frame (rome); bottom sheet with machine (jarl, imp, stcc); card sheet with transcription (imp, stcc, jarl); hand dock math (imp, stcc); tap-vs-pick rule (jarl, stcc); pan (stcc e2e); phone menus (jarl menus-phone.css 861 lines).
Reusable vs game-own:
- jarl reusable: viewport machine and store, layoutModeFor, fit.ts, safeArea.ts, Sheet + sheet.machine + sheetStore, disclosure machine, rotate panel, CSS tokens. Game-own: Zones, Sheets (463 lines), PhoneBar, PhoneCard, handSize, PHONE_ROUTES list. About a third of the folder by files is reusable.
- imp reusable: dock math, short prompt, sheet store, phoneInsets test. Game-own: PhoneBoard, PhoneAreas, cardInfo (517 lines of game text), the 1361-line css.
- stcc and warps: mostly game layout; only the hook (usePhoneLayout / useLayout) is reusable.
- rome: ResolutionFrame and pure fitBox/resolutionSize/shouldFrame (tested) are reusable; no phone layout.
Verdict: Base jarl. Graft imp dock test and phoneInsets test, stcc pan/tap e2e specs as templates, rome ResolutionFrame, warps landscape layout only if a game needs it. Parameterise PHONE_ROUTES, zone and sheet components, hand size, game tokens. Lift M: the viewport store imports jarl routes and settings, so inject the phone-route list and the Layout setting. Risks: none for licences.
