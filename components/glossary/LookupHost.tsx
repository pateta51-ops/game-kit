// The open lookup over whatever screen is showing (lifted from warps src/ui/glossary/LookupHost.tsx): a popover beside the
// link on the desktop, phone-mode's bottom sheet on a phone. Close, Escape or a press outside closes it. Words inside are
// links: one shows its entry in the same place, and Back returns. Mounted once, inside <GlossaryProvider>. It reads the
// entries and the lookup store only, so it works while the game waits on a prompt.
import { useEffect, useId, useLayoutEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { isPhone, useViewport } from '../phone-mode/index.ts';
import { Sheet } from '../phone-mode/ui.ts';
import { paragraphs, type GlossaryEntry } from './match.ts';
import { GlossaryLink, GlossaryText, type OnTerm } from './GlossaryText.tsx';
import { useGlossary } from './context.ts';
import { besideAnchor, useLookup, type LookupAnchor } from './lookupStore.ts';

export interface LookupWords {
  back: string;
  close: string;
  glossary: string;
  rule: string;
  rules: string;
  seeAlso: string;
}
const WORDS: LookupWords = { back: 'Back', close: 'Close', glossary: 'Glossary', rule: 'Rule', rules: 'Rules', seeAlso: 'See also:' };

/** An entry's words: summary, body, rules and "See also", every term a link. */
export function EntryBody({
  id,
  onTerm,
  ruleHref,
  hideRules,
  words = WORDS,
}: {
  id: string;
  /** Leave the rule ids out of the DOM. */
  hideRules?: boolean;
  onTerm?: OnTerm;
  ruleHref?: (rule: string) => string;
  words?: LookupWords;
}) {
  const entry = useGlossary().index.entries.get(id);
  const entries = useGlossary().index.entries;
  if (entry === undefined) return null;
  const on = onTerm === undefined ? {} : { onTerm };
  const rules = hideRules === true ? [] : (entry.rules ?? []);
  const see = entry.see ?? [];
  return (
    <>
      <p className="kit-glo-summary" data-testid="lookup-summary">
        <GlossaryText text={entry.summary} {...on} />
      </p>
      {paragraphs(entry.body).map((p, i) => (
        <p key={i} className="kit-glo-para">
          <GlossaryText text={p} {...on} />
        </p>
      ))}
      {rules.length > 0 && (
        <p className="kit-glo-rules">
          {rules.length === 1 ? words.rule : words.rules}{' '}
          {rules.map((r, i) => (
            <span key={r}>
              {i > 0 ? ', ' : ''}
              {ruleHref === undefined ? (
                <span className="kit-glo-rule" data-rule={r}>
                  {r}
                </span>
              ) : (
                <a className="kit-glo-rule" href={ruleHref(r)} data-rule={r} onClick={() => { useLookup.getState().close(); }}>
                  {r}
                </a>
              )}
            </span>
          ))}
        </p>
      )}
      {see.length > 0 && (
        <p className="kit-glo-see">
          {words.seeAlso}{' '}
          {see.map((s, i) => (
            <span key={s}>
              {i > 0 ? ', ' : ''}
              <GlossaryLink id={s} {...on}>
                {entries.get(s)?.term ?? s}
              </GlossaryLink>
            </span>
          ))}
        </p>
      )}
    </>
  );
}

export function LookupHost({
  phone,
  words = WORDS,
  kindTitle,
  ruleHref,
  glossaryHref,
  slideMs,
  hideRules,
  frame: Frame,
  prefer,
  avoid,
  closeOn,
}: {
  hideRules?: boolean;
  /** Close the lookup when this value changes (a route, a path); popstate and hashchange always close it. */
  closeOn?: unknown;
  /** The game's own wrapper for the popover's content (the head, body and buttons). */
  frame?: ComponentType<{ icon: ReactNode; name: string; children: ReactNode; kind?: string; entry: GlossaryEntry }>;
  /** Sides to try first, in order (default right, then left). */
  prefer?: readonly ('right' | 'left')[];
  /** Rects (read when the popover opens) the popover keeps off when another side is free. */
  avoid?: () => readonly LookupAnchor[];
  /** Sheet or popover; by default phone-mode's layout decides. */
  phone?: boolean;
  words?: LookupWords;
  /** The heading over the term, from the entry's kind. */
  kindTitle?: (kind: string) => ReactNode;
  ruleHref?: ((rule: string) => string) | undefined;
  /** A link to the game's glossary screen at this entry. */
  glossaryHref?: ((id: string) => string) | undefined;
  slideMs?: number;
}) {
  const trail = useLookup((s) => s.trail);
  const anchor = useLookup((s) => s.anchor);
  const mode = useViewport((s) => s.mode);
  const sheet = phone ?? isPhone(mode);
  const box = useRef<HTMLElement>(null);
  const titleId = useId();
  const id = trail.at(-1);
  const { index, renderIcon } = useGlossary();
  const entry = index.entries.get(id ?? '');
  const open = entry !== undefined;

  useEffect(() => {
    const shut = (): void => { useLookup.getState().close(); };
    window.addEventListener('popstate', shut);
    window.addEventListener('hashchange', shut);
    return () => {
      window.removeEventListener('popstate', shut);
      window.removeEventListener('hashchange', shut);
    };
  }, []);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else useLookup.getState().close();
  }, [closeOn]);

  // Escape closes the lookup first (before anything under it)
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      useLookup.getState().close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    const el = box.current;
    if (el === null || sheet) return;
    const size = el.getBoundingClientRect();
    const screen = { width: window.innerWidth, height: window.innerHeight };
    const a = anchor ?? { left: screen.width / 2, right: screen.width / 2, top: screen.height / 3, bottom: screen.height / 3 };
    const place = besideAnchor(a, { width: size.width, height: size.height }, screen, undefined, { ...(prefer === undefined ? {} : { prefer }), ...(avoid === undefined ? {} : { avoid: avoid() }) });
    el.style.left = `${String(place.left)}px`;
    el.style.top = `${String(place.top)}px`;
    el.style.visibility = 'visible';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, id, sheet]);

  if (id === undefined || entry === undefined) return null;
  const close = (): void => {
    useLookup.getState().close();
  };
  const kind = entry.kind === undefined ? null : (kindTitle?.(entry.kind) ?? null);
  const foot = (
    <div className="kit-glo-foot">
      {trail.length > 1 && (
        <button type="button" className="kit-glo-btn" data-testid="lookup-back" onClick={() => { useLookup.getState().back(); }}>
          {words.back}
        </button>
      )}
      {glossaryHref !== undefined && (
        <a className="kit-glo-btn" href={glossaryHref(id)} data-testid="lookup-glossary" onClick={close}>
          {words.glossary}
        </a>
      )}
      <button type="button" className="kit-glo-btn kit-glo-btn--primary" data-testid="lookup-close" onClick={close}>
        {words.close}
      </button>
    </div>
  );
  const body = (
    <div className="kit-glo-body" data-lookup={id} data-testid="lookup-body">
      <EntryBody id={id} words={words} {...(hideRules === true ? { hideRules } : {})} {...(ruleHref === undefined ? {} : { ruleHref })} />
    </div>
  );
  if (sheet)
    return (
      <Sheet
        testId="lookup"
        className="kit-glo-sheet"
        onClose={close}
        closeLabel={words.close}
        foot={foot}
        {...(slideMs === undefined ? {} : { slideMs })}
        title={
          <span data-lookup={id}>
            {kind !== null && <span className="kit-glo-kind">{kind} </span>}
            <span data-testid="lookup-term">{entry.term}</span>
          </span>
        }
      >
        {body}
      </Sheet>
    );
  return (
    <div className="kit-glo-scrim" data-testid="lookup-scrim" onClick={close} onPointerDown={(event) => { event.stopPropagation(); }}>
      <section
        ref={box}
        className="kit-glo-pop"
        style={{ visibility: 'hidden' }}
        role="dialog"
        aria-modal="true"
        {...(Frame === undefined ? { 'aria-labelledby': titleId } : { 'aria-label': entry.term })}
        data-testid="lookup"
        data-lookup={id}
        onClick={(event) => { event.stopPropagation(); }}
      >
        {Frame === undefined ? (
          <>
            <header className="kit-glo-head">
              {kind !== null && <span className="kit-glo-kind">{kind}</span>}
              <h2 className="kit-glo-term" id={titleId} data-testid="lookup-term">
                {entry.term}
              </h2>
            </header>
            {body}
            {foot}
          </>
        ) : (
          <Frame icon={entry.icon === undefined ? null : (renderIcon?.(entry.icon, entry) ?? null)} name={entry.term} entry={entry} {...(entry.kind === undefined ? {} : { kind: entry.kind })}>
            {body}
            {foot}
          </Frame>
        )}
      </section>
    </div>
  );
}
