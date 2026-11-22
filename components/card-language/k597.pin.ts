import { hashValue } from '../engine-core/index.ts';
import { cardPack, type OfferPolicy, type PackEnv } from './pack.ts';
import { gen, offerGame, type G, type S } from './offerGame.ts';

// K597: the answers of `judge` (and so `wouldChange`) on 1,800 random effects under 3 policies; the test compares them with a hash recorded from main before K597.
const POLICIES: readonly OfferPolicy<S>[] = [{}, { noChange: 'skip', deadChoice: 'bar', paid: 'effect' }, { noChange: 'bar', cost: 'whole', fewer: 'exact', branches: 8, view: ({ zones, res, marks }) => ({ zones, res, marks }) }];
export const pinned = (): { hash: string; count: number } => {
  const A: PackEnv = { seat: 'a', source: 'p1' };
  const out: string[] = [];
  for (const offer of POLICIES) {
    const g = offerGame(cardPack<G>, { offer });
    const { s, content } = g.at();
    for (const seed of [597, 5971]) {
      const eff = gen(seed);
      for (let i = 0; i < 300; i += 1) {
        const e = eff(2);
        try {
          const r = g.pack.judge(s, content, e, A);
          out.push(`${g.pack.wouldChange(s, content, e, A)} ${r.answer} ${String(r.reason)} ${r.error === undefined ? '' : String(r.error)}`);
        } catch (x) {
          out.push(`throws ${String(x)}`);
        }
      }
    }
  }
  return { hash: hashValue(out), count: out.length };
};
