# k-docs-agents notes

(a) performance: none. catalog.mjs reads about 60 small files.
(b) implicit state: none. docs/catalog-games.json is a snapshot of sibling game checkouts; refresh with `node scripts/catalog.mjs --scan`.
(c) kit candidates: scripts/readme-examples.mjs (extract and type-check README examples) would suit any repo with component READMEs. Weak examples (effect-library, story, tutorial, pieces-3d) compile but show little.
