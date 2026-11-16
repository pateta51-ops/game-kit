// The dev route: one fixture at a time on the game's own render function. An answer is checked by the game and listed,
// never played: nothing reaches a game or a store.
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { galleryEntries, loadFixture, type Fixture, type FixtureGroup, type GalleryEntry, type GallerySpec, type Loaded } from './registry';
import './gallery.css';

export interface GalleryProps<S> {
  readonly spec: GallerySpec<S>;
  /** The fixture id of the route (`prompt:<kind>`, `ending:<kind>`), or null for the list alone. */
  readonly selected: string | null;
  /** The link to a fixture id in the game's router. */
  readonly href: (id: string) => string;
  /** The game's prompt component or end screen on the state. `answer` returns whether the picks would be legal. */
  readonly render: (state: S, entry: GalleryEntry<S>, answer: (picks: readonly string[]) => boolean) => ReactNode;
  /** The engine's check of an answer, not applied: true, or why it is refused. Without it every answer is listed as given. */
  readonly check?: (state: S, picks: readonly string[]) => true | string;
  readonly title?: string;
  readonly loadMs?: number;
}

const GROUPS: readonly (readonly [FixtureGroup, string])[] = [
  ['prompt', 'Prompt kinds'],
  ['ending', 'Endings'],
];

export function Gallery<S>({ spec, selected, href, render, check, title = 'Gallery (dev)', loadMs }: GalleryProps<S>) {
  const entries = useMemo(() => galleryEntries(spec), [spec]);
  const entry = entries.find((e) => e.id === selected) ?? null;
  return (
    <div className="kit-gallery">
      <h1>{title}</h1>
      {GROUPS.map(([group, label]) => (
        <nav key={group} aria-label={label}>
          {entries
            .filter((e) => e.group === group)
            .map((e) => (
              <a key={e.id} href={href(e.id)} aria-current={e.id === selected ? 'page' : undefined} data-missing={e.fixture ? undefined : ''}>
                {e.kind}
                {e.fixture ? '' : ' (no fixture)'}
              </a>
            ))}
        </nav>
      ))}
      {selected === null || selected === '' ? (
        <p>Choose a kind. Each one opens on its fixture.</p>
      ) : entry === null ? (
        <p role="alert">The game lists no kind {selected}.</p>
      ) : entry.fixture === null ? (
        <p role="alert">
          No fixture for the {entry.group} kind {entry.kind}.
        </p>
      ) : (
        <Shown key={entry.id} spec={spec} entry={entry} fixture={entry.fixture} render={render} check={check} loadMs={loadMs} />
      )}
    </div>
  );
}

function Shown<S>({
  spec,
  entry,
  fixture,
  render,
  check,
  loadMs,
}: {
  readonly spec: GallerySpec<S>;
  readonly entry: GalleryEntry<S>;
  readonly fixture: Fixture<S>;
  readonly render: GalleryProps<S>['render'];
  readonly check: GalleryProps<S>['check'] | undefined;
  readonly loadMs: number | undefined;
}) {
  const [loaded, setLoaded] = useState<Loaded<S> | null>(null);
  const [answers, setAnswers] = useState<readonly string[]>([]);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    void loadFixture(spec, fixture, loadMs).then((r) => {
      if (live) setLoaded(r);
    });
    return () => {
      live = false;
    };
  }, [spec, fixture, loadMs]);
  if (loaded === null) return <p>Loading {entry.id}…</p>;
  if (!loaded.ok)
    return (
      <p role="alert">
        The fixture {entry.id} is stale: {loaded.error}.
      </p>
    );
  const { state } = loaded;
  const answer = (picks: readonly string[]): boolean => {
    const v = check ? check(state, picks) : true;
    setAnswers((a) => [...a, `${JSON.stringify(picks)}: ${v === true ? (check ? 'valid' : 'not checked') : `refused (${v})`}`]);
    return v === true;
  };
  return (
    <div className="kit-gallery-shown">
      <section data-testid="gallery-fixture" data-group={entry.group} data-kind={entry.kind} aria-label={`Fixture: ${entry.kind}`}>
        <DrawGuard key={round} id={entry.id}>
          <Drawn state={state} entry={entry} answer={answer} render={render} />
        </DrawGuard>
      </section>
      <aside>
        {fixture.note === undefined ? null : <p>{fixture.note}</p>}
        <h2>Answers (checked, not played)</h2>
        <ol data-testid="gallery-answers">
          {answers.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => {
            setRound((n) => n + 1);
          }}
        >
          Open it again
        </button>
      </aside>
    </div>
  );
}

function Drawn<S>({ state, entry, answer, render }: { readonly state: S; readonly entry: GalleryEntry<S>; readonly answer: (picks: readonly string[]) => boolean; readonly render: GalleryProps<S>['render'] }) {
  return <div>{render(state, entry, answer)}</div>;
}

class DrawGuard extends Component<{ readonly id: string; readonly children: ReactNode }, { readonly error: string | null }> {
  override state: { readonly error: string | null } = { error: null };
  static getDerivedStateFromError(e: unknown): { readonly error: string } {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return (
      <p role="alert">
        The fixture {this.props.id} failed to draw: {this.state.error}.
      </p>
    );
  }
}
