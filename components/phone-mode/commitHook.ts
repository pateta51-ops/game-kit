import { useSecondTap } from './secondTap';

/** The scale that draws a piece `w` wide in a box `box` wide. */
export const scaleFor = (w: number, box: number) => (w > 0 ? box / w : 1);

/**
 * `twoTap` is the game's flag (an irreversible answer on a touch screen). True: the second tap on the same id commits
 * (`useSecondTap`; `onArm` fires on the arming tap, e.g. the armed tick). False: one tap commits.
 */
export function useCommitTap(commit: (id: string) => void, o: { twoTap: boolean; resetKey?: unknown; onArm?: (id: string) => void }) {
  const st = useSecondTap(commit, o.resetKey);
  return {
    armed: o.twoTap ? st.armed : null,
    tap(id: string) {
      if (!o.twoTap) return commit(id);
      const was = st.armed;
      st.tap(id);
      if (was !== id) o.onArm?.(id);
    },
    disarm: () => st.disarm(),
  };
}
