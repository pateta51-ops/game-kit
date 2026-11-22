# Pattern: themed screen frames, dev and phone scripts

No component: the frame is a game's look (SELECTION.md, "Menus shell and phone"). Kit parts to use: app frame (K6: routes, start-up, error boundary), phone mode (K8), theme tokens.

## Example (read, never edit)
- stcc `Star-trek-captains-chair-game` @ `9fc59643`: `src/ui/screens/ScreenFrame.tsx` (frame + `Panel`).
- rome `rome-fate-of-an-empire-fan-prototype` @ `1d0fd2e`: `src/ui/screens/MenuFrame.tsx` (+ `MenuNav`); `src/ui/frame/ResolutionFrame.tsx` (pure `fitBox`, `resolutionSize`, `shouldFrame`: reusable).
- Dev and phone scripts: jarl `6f006a2`, `package.json` scripts and `scripts/`; ports are per game and never copied. Gap: the script bodies were not read for this note.

## What a frame is
One component every menu-type screen (settings, saved games, packs, glossary, rules, start menu) renders inside. Props: `title`, optional `subtitle`, `active` route name, `testId`, `children`; `wide` where needed. It supplies, in the game's look: logo or emblem, page title, side list of screens, Home link, a way back to the game in progress when one is running, and panels (`Panel { title, hero, testId }`).

## Rules that held
- The list of screens is data (`{ route, label, testId }[]`) and follows owner decisions (stcc D-446: no Rules link in the list). Routes come from the app frame, never string literals in the frame.
- Theme only through tokens (CSS variables) and one stylesheet per frame (`screens.css`, `menus.css`). The look is approved on a mock first; the frame then copies the mock's classes.
- Every screen reached from the main menu can go back to it; with a game running it can also return to the table (rome issue 44). Test ids on the nav links.
- The frame loads what its labels need (fonts, pack) once, not each screen.
- Resolution frame (rome): the PC window letterboxes to the design size with pure fit math; test the math, not the DOM.

## Dev and phone scripts
Per game: `dev` (Vite on the game's port), a phone dev run (host exposed, own https port), `check`, `e2e`, `e2e:phone`. A phone test means a touch pointer and a short side of at most 500 px (jarl, confirmed on the owner's iPhone; stcc uses width at most 700). Ports and origins come from the game's config file, not code.

## Never copy
Another game's logo, colours, fonts, panel names, screen list or ports.

Code: `components/app-frame/` (routes, start-up, error boundary), `components/phone-mode/`, `components/resolution-frame/`, `components/settings/`; tokens checked by `components/theme-check/`.
