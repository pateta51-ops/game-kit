import { Component, useEffect, useState, type ReactNode } from 'react';
import { filterEntries, filterFromHash, hashWithFilter, type SheetEntry } from './sheet.ts';

class Guard extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  override render() {
    return this.state.error === null ? this.props.children : <p data-testid="sheet-error">{this.state.error}</p>;
  }
}

export interface SheetProps {
  readonly entries: readonly SheetEntry[];
  /** The route renders nothing unless this is true: pass the build's dev flag (`isDevMode(undefined, import.meta.env.DEV)`). */
  readonly dev: boolean;
  /** The location hash (default: the window's, followed on hashchange); `q=` in it is the filter. */
  readonly hash?: string;
  readonly title?: string;
  /** Width in px of the narrow layout the width toggle sets (a phone). */
  readonly narrowPx?: number;
}

const Section = ({ e }: { e: SheetEntry }) => {
  const [picks, setPicks] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(e.variants ?? {}).map(([k, o]) => [k, o[0] ?? ''])));
  return (
    <section id={`sheet-${e.id}`} data-testid="sheet-entry" data-id={e.id}>
      <h2>{e.label}</h2>
      {Object.entries(e.variants ?? {}).map(([k, options]) => (
        <span key={k} role="group" aria-label={k}>
          {options.map((o) => (
            <button key={o} type="button" aria-pressed={picks[k] === o} onClick={() => { setPicks({ ...picks, [k]: o }); }}>{o}</button>
          ))}
        </span>
      ))}
      <Guard>{e.render(picks)}</Guard>
      {e.states?.map((s) => (
        <div key={s.label} data-testid="sheet-state">
          <h3>{s.label}</h3>
          <Guard>{s.render()}</Guard>
        </div>
      ))}
    </section>
  );
};

/** The dev route: every entry the game registers, one labelled section each, with its states under it. No look. */
export function Sheet({ entries, dev, hash, title = 'Component sheet (dev)', narrowPx = 390 }: SheetProps) {
  const [q, setQ] = useState(() => filterFromHash(hash ?? (typeof window === 'undefined' ? '' : window.location.hash)));
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (hash !== undefined) return;
    const on = () => { setQ(filterFromHash(window.location.hash)); };
    window.addEventListener('hashchange', on);
    return () => { window.removeEventListener('hashchange', on); };
  }, [hash]);
  if (!dev) return null;
  const shown = filterEntries(entries, q);
  const change = (v: string) => {
    setQ(v);
    if (hash === undefined && typeof window !== 'undefined') window.history.replaceState(window.history.state, '', hashWithFilter(window.location.hash, v));
  };
  return (
    <main data-testid="sheet">
      <h1>{title}</h1>
      <input type="search" aria-label="Filter" value={q} onChange={(e) => { change(e.target.value); }} />
      <button type="button" aria-pressed={narrow} onClick={() => { setNarrow(!narrow); }}>{narrow ? 'Narrow' : 'Wide'}</button>
      <p>{shown.length} of {entries.length}</p>
      <nav aria-label="Sections">
        {shown.map((e) => (
          <a key={e.id} href={`#sheet-${e.id}`} onClick={(ev) => { ev.preventDefault(); document.getElementById(`sheet-${e.id}`)?.scrollIntoView?.(); }}>{e.label}</a>
        ))}
      </nav>
      <div data-testid="sheet-body" data-width={narrow ? 'narrow' : 'wide'} style={narrow ? { width: narrowPx } : undefined}>
        {shown.map((e) => <Section key={e.id} e={e} />)}
      </div>
    </main>
  );
}
