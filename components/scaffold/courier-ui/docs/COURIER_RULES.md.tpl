# Courier rules

This is an original, bounded example game, not an adaptation of a published game. Its authored configuration is in `docs/game-spec.json`. The board, locations and movement allowances are public.

Start at the configured depot without the parcel. During setup choose one of the declared movement allowances; the first is the default. On each decision choose one orthogonally adjacent space that the grid's walls do not block. A move spends exactly one allowance. Entering the pickup space collects the parcel permanently. Entering the destination with the parcel ends the game as delivered, including when that move spends the last allowance. Otherwise spending the last allowance ends the game as late. There are no opponents, diagonal moves, extra actions, payments, secret information or optional responses.

Each answer is one undo step. Undo is available before the game ends. Saving an open route decision records the same rules, selected allowance and answers; restoring it resumes that decision. A public-view pilot follows a shortest route to the pickup and then the destination, using seeded tie breaking. It is a test pilot, not an official automa.

The spec supplies an acceptance route independently of the implementation. Generation checks that the route is legal and delivers under the default allowance. `npm run test:acceptance` additionally runs rules, store, save, simulation, invariant and UI tests, then the real browser scenario. The generated assembly record reports bootstrap and game acceptance as not run; generation alone is not acceptance.

Supported configuration: a rectangular square grid up to 20 rows and 20 columns, walls, three distinct cell IDs, one to ten distinct allowances from 1 to 1000, and a winning acceptance route within the default allowance. Other game rules require explicit game-owned adapters. The broader flexible starter remains incomplete.
