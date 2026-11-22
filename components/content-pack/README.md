# content-pack

Card and scenario data as a checked pack: the game names its record kinds, each with a zod schema, an id field and the fields that refer to other kinds; `load` refuses with every problem at once (duplicate ids, dangling references, schema failures, unknown verbs, your own extra checks). Also the expansion choice (`expansion.ts`, `ui.ts`): a registry of products with `dependsOn`, tick/untick with dependencies, a serialisable `Choice`, and `mergePacks` of a base plus its expansions into one index. Not here: importing or storing packs, the game's record shapes, verbs or words; checking one effect at run time (card-language `validateEffect`, used here for `effects` fields).

## Rules for agents

**What it does:** Card and scenario data as a checked pack (`load`), plus the expansion choice and `mergePacks`. The game names its kinds, schemas and verbs.

**You must:**
1. Define `def.kinds`: each kind has a zod `schema`, an `id` field (default `id`), `refs` (`field: targetKind`, string or string[]) and `effects` fields. Install `zod`.
2. Call `load(def, { kind: records[] })` and handle `{ ok: false, problems }` (all problems come at once), or use `loadOrThrow` at startup.
3. For CSV use `loadText`: every CSV value is a string, so the schema must use `z.coerce` for numbers.
4. Give `def.verbs` (the game's verb table) so `effects` fields are checked with card-language `validateEffect`; extra checks go in `def.check(kind, record, all)` returning problem strings.
5. Describe expansions in a `Registry` with `dependsOn`; `tick`/`untick` keep dependencies, and `choiceFromJson` returns null when a saved choice no longer fits the registry.
6. Use `mergePacks` for base plus expansions: one owner per record id (`E_PACK_CONFLICT` across packs, `E_DUP_ID` in one); replace a record only with `replaces: { kind, id, by }`.
6b. For dossier card CSVs that share one column schema use `dossierRow({ icons, syntax?, textColumns, columns?, joiner?, notDeck? })`: pass `.kind` as a kind of `loadText`; each row gives `id` (from `component_id`), `deck`, `name`, `type`, `quantity`, `text` (the text columns joined with ` ¶ `), `icons` (parsed by card-parts `parseIconText`, never a second reader), `iconsOnCard`, `artFront`, `artBack`, `extra` (other columns). `checkIconsOnCard: false` switches that count check off (icons printed outside the text columns); a `quantity` that is not a whole number is a problem naming the id. A filled `icons_on_card` that differs from the printed marker count, or an unknown icon, is a problem naming the id. `expand(records)` gives one record per copy (`id#1..N`, `base` = the id), skipping `notDeck` types.
7. Draw the choice with `ExpansionPicker` (unstyled; the game styles it).

**Common mistakes:**
- Passing data for a kind the definition does not list: it is a problem (`unknown kind`).
- A reference to an id missing from the target kind is a problem, not ignored.
- A dependency cycle in the registry throws (`dependencyClosure`).


- `load(def, { kind: records[] })` gives `{ ok: true, pack: { records, byId } }` (`byId` keyed `kind:id`) or `{ ok: false, problems }`; `loadOrThrow` throws one message listing them.
- Kind: `{ schema, id? = 'id', refs? = { field: targetKind } (string or string[] fields), effects? = [fields holding card-language steps] }`. `def.verbs` is the game's verb table; `def.check(kind, record, all)` returns extra problems.
- `loadText(def, { kind: { csv } | { json } })`: CSV through card-harness `parseCsv` (every value is a string: use `z.coerce` in the schema), JSON as a list; a bad file is a problem, not a throw.
- Expansion choice: `Registry` = `{ id, name?, kind? 'base'|'expansion'|'variant', dependsOn?, unavailable? }[]`. `dependencyClosure` (throws on a cycle), `checkRegistry`, `tick`/`untick`/`toggle` (ticking ticks what is needed; unticking unticks dependents), `makeChoice`/`choiceToJson`/`choiceFromJson` (null when it does not hold against the registry), `mergeOrder`.
- `mergePacks(def, registry, packs: { id, data, replaces? }[], choice, { replacements?, printedAs? })`: needs and cycles checked; one owner per record id (`E_PACK_CONFLICT` across packs, `E_DUP_ID` inside one); `replaces: { kind, id, by }` puts the `by` record under the replaced id (field `printedAs` = `by`) and drops `by`, inactive ones (`replacements: 'variantsOnly'`, expansions only) keep the original; a variant is all its records or none; then `load(def, merged)`.
- `ui.ts`: `ExpansionPicker({ registry, base, ticked, onChange, words? })`, unstyled: base locked on, one checkbox per product, variant note, unavailable ones disabled with their reason.

## Use it in 10 lines

```ts
import { dossierRow, loadText } from '../kit/content-pack/index';

const d = dossierRow({ icons: { gem: { label: 'gem' } }, syntax: { open: '{', close: '}', separator: ':' }, textColumns: ['rules'], notDeck: ['sheet'] });
const r = loadText({ kinds: { card: d.kind } }, { card: { csv: 'component_id,name,type,quantity,rules\nx,X,unit,2,Gain {gem:1}.' } });
console.log(r.ok ? d.expand(r.pack.records.card as never[]).map((c) => c.id) : r.problems); // ['x#1', 'x#2']
```

```ts
import { z } from 'zod';
import { loadText } from '../kit/content-pack/index';

const def = { kinds: {
  deck: { schema: z.object({ id: z.string() }) },
  card: { schema: z.object({ id: z.string(), cost: z.coerce.number(), deck: z.string() }), refs: { deck: 'deck' } },
} };
const r = loadText(def, { deck: { json: '[{"id":"red"}]' }, card: { csv: 'id,cost,deck\na,2,red\n' } });
console.log(r.ok ? r.pack.byId.get('card:a') : r.problems.join('\n'));
```

```ts
import { z } from 'zod';
import { makeChoice, mergePacks, tick } from '../kit/content-pack/expansion';

const reg = [{ id: 'core' }, { id: 'ext', kind: 'expansion' as const, dependsOn: ['core'] }];
const def = { kinds: { card: { schema: z.object({ id: z.string() }) } } };
const ticked = tick(reg, 'core', [], 'ext');
const packs = [{ id: 'core', data: { card: [{ id: 'a' }] } }, { id: 'ext', data: { card: [{ id: 'b' }] } }];
const m = mergePacks(def, reg, packs, makeChoice('core', ticked));
console.log(m.ok ? [...m.pack.byId.keys()] : m.problems);
```
