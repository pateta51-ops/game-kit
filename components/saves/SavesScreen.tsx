import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import { downloadText } from '../small-helpers/download.ts';
import type { PortTypes } from '../engine-core/index.ts';
import type { HistoryOf, SaveOf } from './types.ts';
import type { Saves, StoredSave } from './saves.ts';
import './saves.css';
import { SAVES_WORDS, type SavesWords } from './words.ts';


export type SavesButtonKind = 'load' | 'export' | 'rename' | 'delete' | 'save';
export interface SavesButtonProps {
  readonly label: string;
  readonly onClick: (() => void) | undefined;
  readonly disabled: boolean;
  readonly kind: SavesButtonKind;
  /** The default classes plus the screen's `buttonClass`. */
  readonly className: string;
  readonly type: 'button' | 'submit';
  readonly testId: string;
}

export interface SavesScreenProps<G extends PortTypes> {
  readonly saves: Saves<G>;
  /** The game being played; null or `canSave` false disables Save. */
  readonly history: HistoryOf<G> | null;
  readonly canSave?: boolean;
  /** The game's line for a save that loads ("Game 4, 5 Season Points"). */
  readonly summary: (state: G['state'], save: SaveOf<G>) => string;
  /** Load a save; a string is the reason it failed, shown on the status line. */
  readonly onLoad: (save: SaveOf<G>, key: string) => string | void;
  readonly words?: Partial<SavesWords>;
  readonly className?: string;
  /** Delete needs a second tap on the same row (the button then reads `words.confirmDelete`). */
  readonly confirmDelete?: boolean;
  /** Named saves get a Rename button: the name becomes a text field, the button then reads `words.save`. */
  readonly rename?: boolean;
  /** Draws the import control; call `open` to pick a file (the file input stays hidden). Default: the bare file input. */
  readonly renderImport?: (open: () => void, label: string) => ReactNode;
  /** Added to the class of every button the screen draws. */
  readonly buttonClass?: string;
  /** Draws a button instead of the default `<button>`; wire `onClick`, `disabled`, `type` and `testId` through. */
  readonly renderButton?: (b: SavesButtonProps) => ReactNode;
  /** K391: false drops the "saved <date>" line (when the game's summary already shows the date). */
  readonly savedLine?: boolean;
  readonly download?: (text: string, name: string) => boolean;
}

const when = (iso: string): string => iso.slice(0, 16).replace('T', ' ');

export function SavesScreen<G extends PortTypes>(p: SavesScreenProps<G>) {
  const w = { ...SAVES_WORDS, ...p.words };
  const { saves } = p;
  const [auto, setAuto] = useState<[string, StoredSave<G>][]>([]);
  const [named, setNamed] = useState<[string, StoredSave<G>][]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ key: string; name: string } | null>(null);
  const [fileEl, setFileEl] = useState<HTMLInputElement | null>(null);
  const openFile = () => fileEl?.click();
  const [memo] = useState(() => new WeakMap<StoredSave<G>, ReturnType<Saves<G>['restore']>>());
  const restored = (stored: StoredSave<G>) => {
    let r = memo.get(stored);
    if (r === undefined) memo.set(stored, (r = saves.restore(stored)));
    return r;
  };
  const refresh = useCallback(() => {
    void Promise.all([saves.listAutosaves(), saves.listNamed()])
      .then(([a, n]) => {
        setAuto(a);
        setNamed(n);
      })
      .catch(() => undefined);
  }, [saves]);
  useEffect(refresh, [refresh]);
  const btn = (kind: SavesButtonKind, label: string, testId: string, o: { primary?: boolean; disabled?: boolean; submit?: boolean; onClick?: () => void }) => {
    const b: SavesButtonProps = {
      label, kind, testId, onClick: o.onClick, disabled: o.disabled === true, type: o.submit === true ? 'submit' : 'button',
      className: `kit-sav-btn${o.primary === true ? ' kit-sav-primary' : ''}${p.buttonClass === undefined ? '' : ` ${p.buttonClass}`}`,
    };
    if (p.renderButton) return <Fragment key={kind}>{p.renderButton(b)}</Fragment>;
    return (
      <button key={kind} type={b.type} className={b.className} disabled={b.disabled} data-testid={testId} onClick={b.onClick}>
        {label}
      </button>
    );
  };
  const canSave = p.history !== null && p.canSave !== false;
  const row = ([key, stored]: [string, StoredSave<G>], first: boolean, isNamed = false) => {
    const r = restored(stored);
    const edit = editing?.key === key ? editing : null;
    return (
      <li key={key} className="kit-sav-row" data-testid="save-row" data-slot={key}>
        <div className="kit-sav-what">
          {edit ? (
            <input
              type="text"
              value={edit.name}
              aria-label={w.renameLabel}
              data-testid="save-rename-name"
              onChange={(e) => {
                setEditing({ key, name: e.target.value });
              }}
            />
          ) : (
            <b>{stored.name}</b>
          )}
          {r.ok ? <span>{p.summary(r.state, r.save)}</span> : <span className="kit-sav-bad">{r.error} {w.broken}</span>}
          {p.savedLine !== false && (
            <span className="kit-sav-muted">
              {w.savedAt} {when(stored.save.savedAt)}
            </span>
          )}
        </div>
        {r.ok &&
          btn('load', first ? w.continue : w.load, 'save-load', {
            primary: true,
            onClick: () => {
              const e = p.onLoad(stored.save, key);
              if (typeof e === 'string') setNote(e);
            },
          })}
        {r.ok &&
          btn('export', w.export, 'save-export', {
            onClick: () => {
              (p.download ?? downloadText)(saves.exportText(stored), saves.exportName(stored));
            },
          })}
        {isNamed &&
          p.rename === true &&
          btn('rename', edit ? w.save : w.rename, 'save-rename', {
            onClick: () => {
              if (edit === null) {
                setEditing({ key, name: stored.name });
                return;
              }
              setEditing(null);
              void saves.rename(key, edit.name).then(refresh);
            },
          })}
        {btn('delete', p.confirmDelete === true && armed === key ? w.confirmDelete : w.delete, 'save-delete', {
          onClick: () => {
            if (p.confirmDelete === true && armed !== key) {
              setArmed(key);
              return;
            }
            setArmed(null);
            void saves.remove(key).then(refresh);
          },
        })}
      </li>
    );
  };
  return (
    <div className={`kit-sav ${p.className ?? ''}`}>
      <section className="kit-sav-section">
        <h2>{w.current}</h2>
        <p className="kit-sav-muted">{w.currentLine}</p>
        <ul className="kit-sav-list">
          {auto.length === 0 ? (
            <li className="kit-sav-muted" data-testid="no-autosave">
              {w.noAutosave}
            </li>
          ) : (
            auto.map((a, i) => row(a, i === 0))
          )}
        </ul>
        <h2>{w.saveHeading}</h2>
        <form
          className="kit-sav-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (p.history === null || !canSave) return;
            void saves
              .saveNamed(name.trim() || w.unnamed, p.history)
              .then(() => {
                setName('');
                setNote(w.saved);
                refresh();
              })
              .catch(() => {
                setNote(w.saveFailed);
              });
          }}
        >
          <input
            type="text"
            value={name}
            placeholder={w.namePlaceholder}
            aria-label={w.namePlaceholder}
            data-testid="save-name"
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
          {btn('save', w.save, 'save-new', { primary: true, submit: true, disabled: !canSave })}
        </form>
        {!canSave && <p className="kit-sav-muted">{w.cannotSave}</p>}
        {note !== null && (
          <p role="status" data-testid="save-note">
            {note}
          </p>
        )}
      </section>
      <section className="kit-sav-section">
        <h2>{w.named}</h2>
        <ul className="kit-sav-list">
          {named.length === 0 && <li className="kit-sav-muted">{w.noNamed}</li>}
          {named.map((n) => row(n, false, true))}
        </ul>
        <h2>{w.import}</h2>
        <p className="kit-sav-muted">{w.importLine}</p>
        {p.renderImport?.(openFile, w.import)}
        <input
          ref={setFileEl}
          hidden={p.renderImport !== undefined}
          type="file"
          accept="application/json,.json"
          aria-label={w.import}
          data-testid="save-import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f === undefined) return;
            void f
              .text()
              .then((text) => saves.importNamed(text, f.name.replace(/\.json$/i, '').trim() || w.unnamedImport))
              .then((r) => {
                setNote(r.ok ? w.imported : r.error);
                refresh();
              })
              .catch(() => {
                setNote(w.unreadable);
              });
            e.target.value = '';
          }}
        />
      </section>
    </div>
  );
}
