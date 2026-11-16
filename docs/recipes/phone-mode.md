# Phone mode

Component: [`phone-mode`](../../components/phone-mode/README.md) (needs `state-machines`, `react`, `zustand`). Some owners skip phone for a game (EBR: 4K desktop only); check the plan first.

1. **Layout**: `useViewport.start(root, { setting, onSetting, phoneScreen })`. `layoutModeFor` gives `desk`, `fitted`, `phonePortrait` or `phoneLandscape` from the window and pointer, never the user agent. It writes `data-layout`, `data-orient`, `data-display` on `<html>`. Large screens that are not the design size use `fitZoom` / `applyFit`.
2. **Page setup** (learned on a real iPhone): viewport meta `width=device-width, initial-scale=1` without `viewport-fit=cover`; no `apple-mobile-web-app-capable`; full-height layers use `100dvh`.
3. **Safe areas**: CSS tokens `--sat --sar --sab --sal`; tests set them with `setSafeArea`.
4. **One bottom sheet** for details; folds for sections; **second-tap commit** (`secondTap`, `commitTap`) so a first tap selects and a second commits.
5. The game keeps its phone screens, zones, words and look; the director supplies the phone wireframes.
6. **Tests**: `e2e-helpers` `VIEWPORTS` and `expectNoHorizontalScroll`; `theme-check` `phoneFontFindings` (font floor).
7. Dev: a screen for each state is shown by `prompt-gallery`.

Proof: jsdom tests for the machines and a browser run at each named viewport on the runner.
