// Static screens (release 1.0): the list by family with progress bars, and the toast. No motion, no sound.
import { byFamily, type AchievementDef, type Status } from './achievements';
import { progressText, type Toast } from './toast';
import './achievements.css';

export interface AchievementListProps {
  defs: readonly AchievementDef[];
  statuses: readonly Status[];
  /** Words the game owns (translation). */
  words?: { points?: string; locked?: string };
  className?: string;
}

/** The list by family: a heading with earned / total and points, a row per achievement with a bar; a locked row says how to earn it. */
export function AchievementList({ defs, statuses, words, className }: AchievementListProps) {
  const pts = words?.points ?? 'pts';
  const lock = words?.locked ?? 'Locked';
  return (
    <div className={className ? `kit-ach ${className}` : 'kit-ach'} data-testid="achievements">
      {byFamily(defs, statuses).map((f) => (
        <section key={f.family} className="kit-ach-family" aria-label={f.family}>
          <h3 className="kit-ach-head">
            {f.family} <span className="kit-ach-count">{f.earned} / {f.total} · {f.points} {pts}</span>
          </h3>
          <ul className="kit-ach-rows">
            {defs.filter((d) => d.family === f.family).map((d) => {
              const s = statuses.find((x) => x.id === d.id);
              const earned = s?.earned === true;
              const cur = s?.current ?? 0, tgt = s?.target ?? 0;
              return (
                <li key={d.id} className={earned ? 'kit-ach-row kit-ach-earned' : 'kit-ach-row kit-ach-locked'} data-testid={`ach-${d.id}`}>
                  <span className="kit-ach-name">{d.name}</span>
                  <span className="kit-ach-text">{d.text}</span>
                  {!earned && <span className="kit-ach-state">{lock}</span>}
                  <progress className="kit-ach-bar" value={cur} max={Math.max(1, tgt)} aria-label={d.name} />
                  <span className="kit-ach-num">{progressText(cur, tgt)}</span>
                  {d.checklist && (
                    <ul className="kit-ach-items">
                      {d.checklist.map((k) => (
                        <li key={k} className={s?.done?.includes(k) ? 'kit-ach-item kit-ach-item-done' : 'kit-ach-item'}>{k}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** One centred toast; the game removes it after `toast.holdMs`. `line` words the count ("3 achievements earned"). */
export function AchievementToast({ toast, line, onClose, words }: { toast: Toast; line?: (t: Toast) => string; onClose?: () => void; words?: { ok?: string; many?: string } }) {
  return (
    <div className="kit-ach-toast" role="status" data-testid="achievement-toast">
      <span>{line ? line(toast) : toast.count === 1 ? toast.name : `${toast.count} ${words?.many ?? 'achievements'}`}</span>
      {onClose && <button type="button" onClick={onClose}>{words?.ok ?? 'OK'}</button>}
    </div>
  );
}
