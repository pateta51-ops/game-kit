// A text the game shows, with every glossary term and icon code in it a link (lifted from warps
// src/ui/glossary/GlossaryText.tsx; the game's store, icon renderer and text rewrites are props). The entries come in
// through <GlossaryProvider>. Two ways a link answers:
//   'click'  a press opens the entry (text that is not itself a control);
//   'hold'   inside a control a press already answers: a press still does what the control does, and the entry opens on a
//            right-click or a long press, so a lookup never answers a decision by accident.
import { Fragment, useMemo, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { buildIndex, matchText, type GlossaryEntry } from './match';
import { GlossaryContext, useGlossary, type Ctx, type RenderIcon } from './context';
import { openEntry } from './lookupStore';
import './glossary.css';

export type OnTerm = (id: string, el: Element) => void;
export type LinkMode = 'click' | 'hold';

export const HOLD_MS = 500;

export function GlossaryProvider({
  entries,
  icon,
  renderIcon,
  children,
}: {
  entries: readonly GlossaryEntry[];
  /** The game's icon markup (default `{code}` and `[[code]]`). */
  icon?: RegExp;
  renderIcon?: RenderIcon;
  children: ReactNode;
}) {
  const value = useMemo<Ctx>(
    () => ({ index: buildIndex(entries, icon === undefined ? {} : { icon }), ...(renderIcon === undefined ? {} : { renderIcon }) }),
    [entries, icon, renderIcon],
  );
  return <GlossaryContext.Provider value={value}>{children}</GlossaryContext.Provider>;
}

export function GlossaryLink({ id, children, onTerm = openEntry, mode = 'click' }: { id: string; children: ReactNode; onTerm?: OnTerm; mode?: LinkMode }) {
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const summary = useGlossary().index.entries.get(id)?.summary;
  if (mode === 'hold') {
    const cancel = (): void => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
    return (
      <span
        className="kit-glo-link kit-glo-link--hold"
        data-glossary={id}
        data-testid="glossary-link"
        title={summary}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onTerm(id, event.currentTarget);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse') return;
          held.current = false;
          const el = event.currentTarget;
          cancel();
          timer.current = window.setTimeout(() => {
            held.current = true;
            onTerm(id, el);
          }, HOLD_MS);
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onClickCapture={(event) => {
          // the click that ends a long press opened the entry: it does not also press the control
          if (!held.current) return;
          held.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </span>
    );
  }
  const press = (event: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    onTerm(id, event.currentTarget);
  };
  return (
    <span
      className="kit-glo-link"
      role="link"
      tabIndex={0}
      data-glossary={id}
      data-testid="glossary-link"
      title={summary}
      onClick={press}
      // a press on a link must not start anything under it (a drag, a pick)
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') press(event);
      }}
    >
      {children}
    </span>
  );
}

export function GlossaryText({ text, onTerm, mode = 'click' }: { text: string; onTerm?: OnTerm; mode?: LinkMode }) {
  const { index, renderIcon } = useGlossary();
  return (
    <>
      {matchText(index, text).map((seg, i) => {
        if (seg.kind === 'text') return <Fragment key={i}>{seg.text}</Fragment>;
        const entry = seg.id === null ? undefined : index.entries.get(seg.id);
        const inner =
          seg.kind === 'term' ? seg.text : (renderIcon?.(seg.code, entry) ?? <span className="kit-glo-icon">{entry?.term ?? seg.code}</span>);
        if (seg.id === null) return <Fragment key={i}>{inner}</Fragment>;
        return (
          <GlossaryLink key={i} id={seg.id} mode={mode} {...(onTerm === undefined ? {} : { onTerm })}>
            {inner}
          </GlossaryLink>
        );
      })}
    </>
  );
}
