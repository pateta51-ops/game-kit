// Imperium's phone screen as parts (U11/U12): the frame (top bar, areas, prompt line, tab bar), the tab bar with a lit tab,
// the prompt line that folds to one line with counts at its right, the menu, the sheet foot (primary action, Cancel).
// The game supplies every word and every piece of content; the look is the game's (--pm-* variables, data-part hooks).
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import './phone-mode.css';
import './phone-frame.css';

export interface PhoneTab {
  id: string;
  label: ReactNode;
  /** The open decision picks a card in this tab's area: a light on the tab. */
  lit?: boolean;
  /** Screen-reader words for a lit tab. */
  litNote?: string;
}

/** One screen: top bar, areas (one per tab, each scrolling on its own), the prompt line, the tab bar. Landscape: the tabs a rail on the left, the open prompt a column on the right. */
export function PhoneFrame({ top, banner, dock, tabs, dockOpen, tab, children, className = '', testId, style }: {
  top: ReactNode;
  banner?: ReactNode;
  dock: ReactNode;
  tabs: ReactNode;
  dockOpen: boolean;
  tab: string;
  children: ReactNode;
  className?: string;
  testId?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={style} data-testid={testId} data-part="frame" data-tab={tab} data-dock={dockOpen ? 'open' : 'folded'}>
      {top}
      {banner !== undefined && <div data-part="banner">{banner}</div>}
      <div data-part="main">{children}</div>
      {dock}
      {tabs}
    </div>
  );
}

/** One area of a tab: it scrolls on its own and keeps its place while hidden. */
export function PhoneArea({ id, shown, children }: { id: string; shown: boolean; children: ReactNode }) {
  return (
    <div data-part="area" data-area={id} data-shown={shown ? 'true' : 'false'} aria-hidden={shown ? undefined : 'true'}>
      {children}
    </div>
  );
}

/** The bottom tab bar; the active tab is `aria-pressed`. A tap on the active tab scrolls its area to the top; `onTab` is called for every tap. */
export function TabBar({ tabs, active, onTab, label, testId = 'phone-tabs' }: {
  tabs: readonly PhoneTab[];
  active: string;
  onTab: (id: string) => void;
  label: string;
  testId?: string;
}) {
  return (
    <nav data-part="tabs" aria-label={label} data-testid={testId}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          data-part="tab"
          aria-pressed={active === t.id}
          data-pick={t.lit ? 'true' : undefined}
          data-testid={`tab-${t.id}`}
          onClick={(e) => {
            if (active === t.id) [...(e.currentTarget.closest('[data-part="frame"]')?.querySelectorAll<HTMLElement>('[data-area]') ?? [])].find((a) => a.dataset['area'] === t.id)?.scrollTo({ top: 0 });
            onTab(t.id);
          }}
        >
          {t.label}
          {t.lit && t.litNote ? <span data-part="sr-only"> {t.litNote}</span> : null}
        </button>
      ))}
    </nav>
  );
}

const Chevron = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" data-part="chevron">
    <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The decision docked above the tabs: folded, one line (chevron up, `short`, `counts` at the right); open, a head (`kicker`, chevron down) and the body. The body stays mounted while folded (`hidden`). */
export function PromptLine({ open, onToggle, short, counts, kicker, label, children, testId = 'phone-dock' }: {
  open: boolean;
  onToggle: () => void;
  short: ReactNode;
  counts?: ReactNode;
  kicker: ReactNode;
  label: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <section data-part="dock" aria-label={label} data-testid={testId} data-open={open ? 'true' : 'false'}>
      {open ? (
        <button type="button" data-part="dock-head" aria-expanded="true" data-testid="dock-toggle" onClick={onToggle}>
          <span data-part="dock-kicker">{kicker}</span>
          <Chevron up={false} />
        </button>
      ) : (
        <button type="button" data-part="dock-line" aria-expanded="false" data-testid="dock-toggle" onClick={onToggle}>
          <Chevron up />
          <span data-part="dock-short" data-testid="dock-short">{short}</span>
          {counts !== undefined && <span data-part="dock-counts">{counts}</span>}
        </button>
      )}
      <div data-part="dock-body" hidden={!open}>{children}</div>
    </section>
  );
}

/** The slim top bar: `start` (your resources), then the free space, then `end` (Undo, the menu button). */
export function TopBar({ start, end, label, testId = 'phone-bar' }: { start?: ReactNode; end?: ReactNode; label?: string; testId?: string }) {
  return (
    <header data-part="top" aria-label={label} data-testid={testId}>
      <span data-part="top-start">{start}</span>
      <span data-part="top-end">{end}</span>
    </header>
  );
}

/** The menu layer under the top bar: scrim (tap closes), Escape closes, a press on any button or link inside does it, then folds. Kept in the page while folded (`hidden`). */
export function PhoneMenu({ open, onClose, label, children, testId = 'phone-menu', id }: {
  id?: string;
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, onClose]);
  return (
    <div data-part="menu-layer" hidden={!open}>
      <div data-part="menu-scrim" aria-hidden="true" onClick={onClose} />
      <nav id={id} data-part="menu" aria-label={label} data-testid={testId} onClick={(e) => { if ((e.target as HTMLElement).closest('button, a')) onClose(); }}>
        {children}
      </nav>
    </div>
  );
}

export interface SheetAction {
  id: string;
  label: ReactNode;
  primary?: boolean;
  testId?: string;
  onPress: () => void;
}

/** The sheet's foot: an optional reason ("Not now: ..."), an optional note, then the action row; the primary one grows, Cancel or Close is plain. Pass as `<Sheet foot>`. */
export function SheetActions({ actions, reason, note }: { actions: readonly SheetAction[]; reason?: ReactNode; note?: ReactNode }) {
  return (
    <>
      {reason !== undefined && <p data-part="sheet-reason">{reason}</p>}
      {note !== undefined && <p data-part="sheet-note">{note}</p>}
      <div data-part="sheet-actions">
        {actions.map((a) => (
          <button key={a.id} type="button" data-part="sheet-action" data-testid={a.testId} data-primary={a.primary ? 'true' : undefined} onClick={a.onPress}>
            {a.label}
          </button>
        ))}
      </div>
    </>
  );
}
