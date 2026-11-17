# content-pack

Card and scenario data as a checked pack: the game names its record kinds, each with a zod schema, an id field and the fields that refer to other kinds; `load` refuses with every problem at once (duplicate ids, dangling references, schema failures, unknown verbs, your own extra checks). Not here: the game's record shapes, verbs or words; checking one effect at run time (card-language `validateEffect`, used here for `effects` fields).

- `load(def, { kind: records[] })` gives `{ ok: true, pack: { records, byId } }` (`byId` keyed `kind:id`) or `{ ok: false, problems }`; `loadOrThrow` throws one message listing them.
- Kind: `{ schema, id? = 'id', refs? = { field: targetKind } (string or string[] fields), effects? = [fields holding card-language steps] }`. `def.verbs` is the game's verb table; `def.check(kind, record, all)` returns extra problems.
- `loadText(def, { kind: { csv } | { json } })`: CSV through card-harness `parseCsv` (every value is a string: use `z.coerce` in the schema), JSON as a list; a bad file is a problem, not a throw.

## Use it in 10 lines

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
