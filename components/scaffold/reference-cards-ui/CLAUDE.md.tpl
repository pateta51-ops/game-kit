Read AGENTS.md and docs/CARD_RULES.md. This is the bounded original reference-cards composition: one human, one automa, declared content/setup and the supported existing card shapes.

Change the assembly inputs and regenerate to vary supported records and setup; do not repair generated integration code or edit kit/. Keep printed expectations independent of executable effects. Follow docs/PLAN.md and the configured checks.

Generation validates configuration only. Run npm run test:bootstrap on a clean committed consumer to bind the non-browser checks. Run npm run test:acceptance with Chromium for the full game slice and verify its receipt with npm run acceptance:verify. A missing browser is a failed or unexecuted browser gate, never an accepted slice. Receipts bind declared inputs but do not independently establish rule correctness or environmental identity.
