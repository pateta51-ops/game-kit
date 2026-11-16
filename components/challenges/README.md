# challenges

A challenge is a content item picked before a game: a setup restriction plus triggered penalties, written in the game's own card language (release 1.0). Pure, draws nothing, no packages; the kit holds only the shape and the picking, the game keeps the meaning.

- `Challenge<R, E, A> { id, name, text, restriction?, penalties: { on: E, effect: A }[] }`: `R` is the game's restriction data, `E` its event trigger, `A` its effect (usually the type its cards use).
- `ChallengeGame<S, R, E> { allows(restriction, setup), matches(on, event) }`: what the game decides. `S` is the chosen setup (heroes, deck, options).
- `pickable(g, all, setup)`: the challenges the setup may take (no restriction: always).
- `pickChallenge(g, all, id, setup)`: the one picked, or undefined when the id is missing, unknown or not allowed (no challenge is a valid choice).
- `penaltiesFor(g, challenge, event)`: the effects whose trigger matches an event, in listed order; the game runs them through its normal effect resolver, so they undo and replay like any card effect.

Store the picked id in the game's setup so a save and a replay keep it. Tests: `challenges.test.ts`.
