# e2e-helpers

Playwright helpers a game's browser tests share. Lifted from Imperium's `e2e/helpers.ts`, with STCC's `shoot`, `VIEWPORTS` and `motionsDone`, Jarl's autosave wait and Unstoppable's axe helper. `page` and `testInfo` are Playwright's, typed by shape: the kit installs no Playwright and no axe. A failed check throws, which fails the test.

## Rules for agents

**What it does:** Playwright helpers a game's browser tests share: error watching, settling, viewports, screenshots and autosave waits.

**You must:**
1. Call `watchErrors(page, ignore?)` at the start of a test and `w.check()` at the end; it throws on uncaught exceptions, console errors, 400+ responses and failed requests.
2. Ignore known noise with `ignore` (substrings or regexes), for example `ERR_ABORTED` when the game cancels requests.
3. Call `settle(page)` or `finishAnimations(page)` before screenshots and measurements; set the game's moving marker (default `html[data-moving]`) and use `motionsDone`.
4. Call `expectNoHorizontalScroll(page, where)` for each viewport in `VIEWPORTS` (`uhd`, `laptop`, `phone`).
5. Before `page.reload()` call `autosaveSettled(memoryCount, storedCount)`; it throws when the counts are not equal by the timeout.
6. Pass Playwright's own `page` and `testInfo`; the kit installs neither Playwright nor axe.
7. Run the suites through the game's e2e npm scripts (the machine queue), desktop and phone.

**Common mistakes:**
- Skipping `check()`: errors are collected but nothing fails.
- Reading the stored count with your own code that opens the database: use `idbCount`, which never creates it.


`index.ts`:

- `watchErrors(page, ignore?)` at the start of a test; returns `{ errors, check() }`. It collects uncaught exceptions, console errors, requests answered 400 or more and requests that failed (an aborted one counts: ignore `ERR_ABORTED` if the game cancels requests); `ignore` (substrings or regexes) drops lines such as an optional pack address. Call `check()` at the end.
- `expectNoHorizontalScroll(page, where)`.
- `settle(page, timeout?)` waits for every animation and transition that ends (5 s at most); `finishAnimations(page)` jumps them to their end (steadies screenshots and contrast readings); `motionsDone(page, moving?, timeout?)` waits until nothing matches the marker the game sets while its motions play (default `html[data-moving]`).
- `VIEWPORTS` (`uhd`, `laptop`, `phone`) for `page.setViewportSize`.
- `shoot(page, testInfo, name)`: a full-page screenshot in the test's results and report.
- `autosaveSettled(memory, stored, timeout?)` before `page.reload()`: waits until both counts are equal. The game passes how to read each, for example
  `autosaveSettled(() => page.evaluate(() => window.game.actions.length), () => idbCount(page, { db: 'g-saves', store: 'saves', key: 'autosave', path: ['save', 'actions'] }))`.
  `idbCount` gives the length of the array (or the number) at `path` in an IndexedDB record, -1 when absent; it never creates the database.

`a11y.ts` (optional; the game installs `@axe-core/playwright`):

- `expectAccessible(AxeBuilder, page, testInfo, where, tags?)` finishes the animations, runs axe for WCAG 2.1 A and AA (`WCAG_AA`), fails on a serious or critical violation and attaches the others as `axe-minor-<where>`.

Left in the games: starting a game, playing a turn, card-face checks and every locator of a game's screens.

## Use it in 10 lines

```ts
import { VIEWPORTS, expectNoHorizontalScroll, settle, shoot, watchErrors } from '../kit/e2e-helpers/index'
import type { EvalPage, Info, ShotPage, WatchPage } from '../kit/e2e-helpers/index'

// the body of one Playwright test: `page` and `testInfo` are Playwright's
export async function homeScreen(page: WatchPage & EvalPage & ShotPage & { setViewportSize(v: { width: number; height: number }): Promise<void> }, testInfo: Info) {
  const w = watchErrors(page)
  for (const v of VIEWPORTS) {
    await page.setViewportSize(v)
    await settle(page)
    await expectNoHorizontalScroll(page, v.name)
    await shoot(page, testInfo, `home-${v.name}`)
  }
  w.check() // fails the test on an uncaught exception, a console error or a bad response
}
```
