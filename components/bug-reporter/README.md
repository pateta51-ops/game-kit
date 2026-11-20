# bug-reporter

A bug report dialog: screenshot (scrolled areas, game fonts embedded), markup editor, explanation, an offline queue (IndexedDB), filing as a GitHub issue with files on a `bug-reports` branch (409 retry, one issue per report, Send all), a floating button, and a fake GitHub for tests. Needs `state-machines` (the dialog's open/capturing/closed machine).

## Rules for agents

**What it does:** A bug report dialog with screenshot, markup editor, explanation, an offline queue, filing as a GitHub issue, a floating button and a fake GitHub for tests.

**You must:**
1. Call `configureBugReporter({ id, repo, buildSha, snapshot })` once, before any component renders; every other call throws `configureBugReporter was not called`.
2. Import config, stores, queue and filing from `kit/bug-reporter/index` and the components from `kit/bug-reporter/ui`; each component loads `bugs.css` itself.
3. Render `<BugReportHost />` once (it listens for F8), plus `<FloatingBugButton />`, and `<BugSettings />` / `<QueueBar />` in the settings screen.
4. Have `snapshot()` return the replay save, round, prompt, action count and log lines of the open game, or nulls when none is open.
5. Pass `fonts()` for fonts registered with the FontFace API, or the screenshot falls back to default fonts.
6. Let the player type the token in `BugSettings`; never put a token in the config, the repo or the build.
7. List `state-machines` and `small-helpers` in the game's needs.
8. Theme it with the `--bug-*` variables on `:root`, not by editing the kit; use `buttonClass` / `renderButton` to restyle buttons.

**Common mistakes:**
- Filing into a repository other than the configured one: any request outside it is refused.
- Sending an oversized report: the issue body is cut at 60,000 characters and the screenshot is compressed to about 900,000 base64 characters.

## What the game passes in

Call `configureBugReporter(config)` once, before any of the components render (see `config.ts`):

- `id`: a short name; it names exported files, the report format, the token's storage key and the queue database.
- `repo`: `{ owner, repo, branch?, baseBranch?, label? }`. Nothing is hard-coded; the token is typed by the user in `BugSettings` and kept only in their browser.
- `buildSha`, and `snapshot()`: returns what to attach (`contentHash`, `replay` save, `theme`, `round`, `prompt`, `actions`, `log` lines).
- Optional: `useButtonMode` (hook, `auto | on | off`), `useHideFloatingButton` (hook), `markupFont`, `fonts()` (font files to embed in captures), `dev` (installs `window.bugReports`).

Import from `bug-reporter/index` (config, stores, queue, token, filing; no React components) and `bug-reporter/ui` (`BugReportHost`, `FloatingBugButton`, `BugSettings`, `QueueBar`, `BugButton`); the file paths still work. Importing reads nothing: the token's storage is read on first use.

## Mount

Render `<BugReportHost />` once (from `BugReportDialog.tsx`; it also listens for F8), `<FloatingBugButton />`, and `<BugSettings />` / `<QueueBar />` in the game's settings. `openBugReport()` opens the dialog from any button.

## Look

Import nothing else: `bugs.css` defines neutral `--bug-*` variables (colours, fonts, radii) at zero specificity; set them on `:root` or an ancestor to theme it.

## Tests

React tests run in the `ui` (jsdom) Vitest project. `test-utils.ts` configures a stand-in game.

## Use it in 10 lines

```ts
import { configureBugReporter } from '../kit/bug-reporter/index'

declare const cfg: Parameters<typeof configureBugReporter>[0] // id, repo, buildSha, snapshot()
configureBugReporter(cfg) // once, before <BugReportHost /> renders
```

```tsx
import { BugReportHost, FloatingBugButton } from '../kit/bug-reporter/ui'

export const BugTools = () => (
  <>
    <FloatingBugButton />
    <BugReportHost />
  </>
)
```

## Button slots

```tsx
import { BugSettings } from '../kit/bug-reporter/ui'

export const Mine = () => (
  <BugSettings buttonClass="my-btn" renderButton={(b) => <button type={b.type} className={b.className} disabled={b.disabled} data-testid={b.testId} onClick={b.onClick}>{b.label}</button>} />
)
```

`buttonClass` is added to every `.bug-btn` in Settings > Bug reports (Send all, Report, Send, Download, Delete, Save and Forget the token); `renderButton({ label, onClick, disabled, kind, className, type, testId })` draws a button instead. Without them nothing changes. `<BugReportHost />` takes the same two props (`buttonClass`, `renderButton`) for the dialog's own buttons (`kind`: markup, send, queue, export, cancel).
