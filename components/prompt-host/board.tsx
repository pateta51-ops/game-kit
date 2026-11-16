// K123 (UFS src/ui/prompts/confirm.tsx): the confirm bar of a board pick (`pick.ts`).
import type { ReactNode } from 'react';
import type { Kinded, Look } from './host.tsx';
import type { BoardPick } from './pick.ts';

/** The bar under the board: the armed option's label with Confirm and Cancel, else `hint` (or nothing). */
export function BoardBar<P extends Kinded>({ pick, prompt, look, hint = null }: { pick: BoardPick; prompt: P; look: Look<P>; hint?: ReactNode }) {
  const o = prompt.options.find((x) => x.id === pick.armed);
  if (o === undefined) return <>{hint}</>;
  if (prompt.max > 1)
    return (
      <section className={look.cls('board-bar')}>
        <span className={look.cls('count')}>{look.count(pick.picks.length, prompt)}</span>
        <button type="button" className={look.cls('done')} disabled={!pick.ready} onClick={pick.confirm}>
          {look.confirm}
        </button>
        <button type="button" className={look.cls('cancel')} onClick={pick.cancel}>
          {look.cancel}
        </button>
      </section>
    );
  return (
    <section className={look.cls('board-bar')} data-option={o.id}>
      <span className={look.cls('value')}>{look.label(o, prompt)}</span>
      {o.idle === undefined ? null : <small className={look.cls('idle')}>{look.text(o.idle)}</small>}
      <button type="button" className={look.cls('done')} onClick={pick.confirm}>
        {look.confirm}
      </button>
      <button type="button" className={look.cls('cancel')} onClick={pick.cancel}>
        {look.cancel}
      </button>
    </section>
  );
}
