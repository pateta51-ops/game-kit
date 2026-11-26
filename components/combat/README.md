# combat

Run attack, damage, and defeat as data through engine timing. The game supplies its attack calculation, target rules, stats, and the effect of defeat.

## Rules for agents

1. Use `queueCombat` in a game handler or add `combatVerbs` to the game's card-language table. Keep the step data and the game's printed text on the same verb row.
2. Call the function returned by `combatHappen(policy)` from the game's `TimingConfig.happen`. When it returns `false`, handle the occurrence with the game's existing configuration. Keep prevention, replacements, triggers, and checkpoints on the same engine timing configuration.
3. Provide the affected player's `player` ID and the `target` ID. `attack` requires its `source` ID. Resolve target legality and the attack calculation using the game's own rules. Pass damage and armor as nonnegative safe integers.
4. Apply damage synchronously in `applyDamage` and return `true` when the game's updated state calls for defeat. `healthAdjustment` produces the card-language `adjust` step for remaining health with a floor of zero. A game that tracks accumulated wounds supplies its own adjustment.
5. Apply defeat in the `defeat` policy using the target's current state and the game's removal or survival rules. A defeat occurrence can be replaced before that policy runs. Guard against stale targets when reactions can move, heal, or remove them.

## Use it in 10 lines

```ts
import type { Ctx, GameTypes } from '../kit/engine-core/kernel.ts';
import { combatDamageKind, healthAdjustment, queueCombat, type Damage } from '../kit/combat/index.ts';

const hit: Damage = { op: 'damage', source: 'p1-unit', target: 'p2-unit', player: 'p2', amount: 6, damageType: 'ember' };
const occurrenceKind = combatDamageKind(hit.damageType);
const hitTarget = <G extends GameTypes>(ctx: Ctx<G>) => queueCombat(ctx, [hit]);
const takeThreeHealth = healthAdjustment('health', 3);
```

## Resolution

- `attack` passes through the engine's timing windows, then calls `policy.attack` with the current data. The policy may compare totals, roll through `ctx.rng`, choose a damage type, or return an empty list after a miss. An interactive calculation can queue its own prompt and resume task before returning an empty list. That resume task can queue the eventual damage.
- `damage` starts with the ordinary kind `combat.damage`. A `damageType` names a separate timing kind such as `combat.damage.ember`, returned by `combatDamageKind('ember')`. Use that full kind for prevention or replacement rules. Replacements and prevention run before armor. `unpreventable` skips the prevention window. The `piercing` type skips armor. These controls are independent.
- Armor subtracts a flat value from the final incoming amount, down to zero. `applyDamage` receives the post-armor amount and the incoming `Damage` data. A fully absorbed hit leaves health and defeat policy untouched. Use your game event to report health actually lost after its own clamps.
- When `applyDamage` returns `true`, combat queues `combat.defeat` as a new occurrence under the normal timing rules. An effect can also queue the `defeat` verb directly. The game decides which targets to remove and how defeat affects victory, scoring, or the next phase. Emit game events for those outcomes from the policies that actually apply them.
- `queueCombat` returns the engine batch ID for a nonempty list. A zero-length list queues nothing. Steps resolve in list order with their engine follow-ups. Use the game's engine checkpoint and simultaneous resolution policies for rules that compare all results together.

The synthetic engine in `combat.test.ts` wires `combatVerbs`, `combatHappen`, timing handlers, and card-language's actual `adjust` verb. It also checks replay across a prevention prompt.
