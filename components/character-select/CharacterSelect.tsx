// Ported from STCC src/ui/select/parts.tsx, SelectText.tsx and src/ui/screens/NewGame.tsx (27fb8882): a character select
// screen (roster, hero, deck browser, track slot, opponent strip, modes, folded options, Begin). The game supplies data and look.
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  choiceOf,
  deckPage,
  deckTabs,
  fieldsFor,
  firstAllowed,
  groupBySet,
  pieces,
  portraitCrop,
  splitName,
  type Character,
  type CharacterSet,
  type Choice,
  type DeckCard,
  type Mode,
  type Opponent,
  type OptionField,
  type Piece,
  type PortraitSpec as PortraitData,
  type TextLink,
} from './model.ts';

export interface SelectWords {
  roster: string;
  deck: (c: Character) => string;
  search: string;
  all: string;
  prev: string;
  next: string;
  cards: (n: number) => string;
  empty: (c: Character) => string;
  opponent: string;
  options: string;
  begin: ReactNode;
  more: string;
  less: string;
}
const WORDS: SelectWords = {
  roster: 'Characters',
  deck: (c) => `${c.short ?? c.name}’s deck`,
  search: 'Search cards…',
  all: 'All cards',
  prev: 'Previous page',
  next: 'Next page',
  cards: (n) => `${String(n)} card${n === 1 ? '' : 's'}`,
  empty: () => 'No card matches.',
  opponent: 'Opponent',
  options: 'Game options',
  begin: 'Begin',
  more: 'Full text',
  less: 'Close',
};

export interface SelectSlots {
  /** Wraps the whole screen (the game's frame). */
  frame?: ((screen: ReactNode) => ReactNode) | undefined;
  /** The header (title, art) above the mode tabs. */
  header?: ReactNode | undefined;
  /** Replaces the default name plate of a roster entry, the hero or an opponent. */
  plate?: ((c: Character | Opponent, where: 'roster' | 'hero' | 'opponent') => ReactNode) | undefined;
  /** The game's own panel under the deck (a board, a track). */
  track?: ((c: Character, choice: Choice) => ReactNode) | undefined;
  /** A sub-picker in the hero (a board side, a loadout). */
  sub?: ((c: Character, choice: Choice) => ReactNode) | undefined;
  /** Renders one option field in place of the native control (null or undefined keeps the native one; the label stays). */
  field?: ((f: OptionField, value: string | boolean | undefined, set: (v: string | boolean) => void) => ReactNode) | undefined;
  /** Replaces the whole body of the folded options. */
  options?: ((choice: Choice, set: (id: string, v: string | boolean) => void) => ReactNode) | undefined;
}

export type Allowed = { ok: boolean; why?: string | null | undefined };

export interface CharacterSelectProps {
  roster: readonly Character[];
  sets: readonly CharacterSet[];
  opponents?: readonly Opponent[] | undefined;
  modes?: readonly Mode[] | undefined;
  fields?: readonly OptionField[] | undefined;
  initial?: Partial<Choice> | undefined;
  kindOrder?: readonly string[] | undefined;
  kindLabel?: ((kind: string) => ReactNode) | undefined;
  icons?: Iterable<string> | undefined;
  statMax?: number | undefined;
  phone?: boolean | undefined;
  perPage?: number | undefined;
  words?: Partial<SelectWords> | undefined;
  slots?: SelectSlots | undefined;
  renderCard?: ((card: DeckCard) => ReactNode) | undefined;
  renderGlyph?: ((p: Extract<Piece, { kind: 'icon' | 'chip' }>) => ReactNode) | undefined;
  canPick?: ((id: string) => Allowed) | undefined;
  /** Default: any opponent other than the picked character's id. */
  canOppose?: ((id: string, choice: Choice) => Allowed) | undefined;
  problems?: ((choice: Choice) => string[]) | undefined;
  onCard?: ((id: string) => void) | undefined;
  onChange?: ((choice: Choice) => void) | undefined;
  onBegin: (choice: Choice) => void;
}

/** A portrait: the image covering the box at its focus point, or a crop of a region (a card's art) fitted to the box. */
export function Portrait({ p, label }: { p?: PortraitData | undefined; label?: string | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const [a, setA] = useState(1);
  const fit = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r !== undefined && r.width > 0 && r.height > 0) setA(r.width / r.height);
  }, []);
  useLayoutEffect(() => {
    fit();
    const el = ref.current;
    if (typeof ResizeObserver === 'undefined' || el === null || p?.crop === undefined) return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [fit, p?.crop]);
  const f = p?.focus ?? { x: 0.5, y: 0.3 };
  const c = p?.crop === undefined ? null : portraitCrop(f, p.crop, a);
  return (
    <div
      ref={ref}
      data-part="portrait"
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      style={
        p === undefined
          ? undefined
          : {
              backgroundImage: `url("${p.src}")`,
              backgroundSize: c?.size ?? 'cover',
              backgroundPosition: c?.position ?? `${String(f.x * 100)}% ${String(f.y * 100)}%`,
            }
      }
    />
  );
}

/** A text with its icons, chips and linked phrases (a link is a button carrying `data-card`). */
export function RichText({
  text,
  icons,
  links,
  renderGlyph,
  onCard,
}: {
  text: string;
  icons?: Iterable<string> | undefined;
  links?: readonly TextLink[] | undefined;
  renderGlyph?: CharacterSelectProps['renderGlyph'] | undefined;
  onCard?: ((id: string) => void) | undefined;
}) {
  return (
    <>
      {pieces(text, icons, links).map((p, i) =>
        p.kind === 'text' ? (
          <span key={i}>{p.text}</span>
        ) : p.kind === 'link' ? (
          <button key={i} type="button" data-part="link" data-card={p.id} onClick={() => onCard?.(p.id)}>
            {p.text}
          </button>
        ) : (
          <span key={i} data-part={p.kind} data-name={p.name}>
            {renderGlyph?.(p) ?? p.name}
          </span>
        ),
      )}
    </>
  );
}

/** A summary that shows the full text on hover, focus or tap. */
function Summary({
  summary,
  full,
  rich,
  words,
}: {
  summary: string;
  full?: string | undefined;
  rich: (t: string) => ReactNode;
  words: SelectWords;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const shown = open || hover;
  return (
    <div
      data-part="summary"
      data-open={shown ? 'yes' : 'no'}
      onMouseEnter={() => {
        setHover(true);
      }}
      onMouseLeave={() => {
        setHover(false);
      }}
    >
      <p>{rich(summary)}</p>
      {full === undefined ? null : (
        <>
          <button
            type="button"
            data-part="more"
            aria-expanded={shown}
            onClick={() => {
              setOpen((o) => !o);
            }}
          >
            {shown ? words.less : words.more}
          </button>
          {shown ? <div data-part="full">{rich(full)}</div> : null}
        </>
      )}
    </div>
  );
}

function Meter({ n, max, line }: { n?: number | undefined; max: number; line?: string | undefined }) {
  if (n === undefined && line === undefined) return null;
  return (
    <div data-part="stat">
      {line === undefined ? null : <span data-part="stat-line">{line}</span>}
      {n === undefined ? null : (
        <span data-part="meter" role="meter" aria-valuenow={n} aria-valuemin={0} aria-valuemax={max}>
          {Array.from({ length: max }, (_, i) => (
            <i key={i} data-on={i < n ? 'yes' : 'no'} />
          ))}
        </span>
      )}
    </div>
  );
}

/** The roster, grouped by set. */
export function Roster({
  list,
  sets,
  picked,
  can,
  onPick,
  plate,
  title,
}: {
  list: readonly Character[];
  sets: readonly CharacterSet[];
  picked: string;
  can: (id: string) => Allowed;
  onPick: (id: string) => void;
  plate?: SelectSlots['plate'] | undefined;
  title: string;
}) {
  return (
    <aside data-part="roster">
      <div data-part="roster-title">{title}</div>
      {groupBySet(list, sets).map((g) => (
        <div key={g.set.id} data-part="set" data-set={g.set.id}>
          <div data-part="set-label">{g.set.label}</div>
          {g.items.map((c) => {
            const r = can(c.id);
            return (
              <button
                key={c.id}
                type="button"
                data-part="entry"
                data-id={c.id}
                data-on={c.id === picked ? 'yes' : 'no'}
                aria-pressed={c.id === picked}
                disabled={!r.ok}
                title={r.why ?? undefined}
                onClick={() => {
                  onPick(c.id);
                }}
              >
                <Portrait p={c.portrait} />
                {plate?.(c, 'roster') ?? (
                  <span data-part="plate">
                    <b>{c.short ?? c.name}</b>
                    {c.statLine === undefined ? null : <small>{c.statLine}</small>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

/** The deck browser: tabs by kind with counts, a search and pages of cards. Give it `key={character id}`. */
export function DeckBrowser({
  c,
  perPage,
  order,
  kindLabel,
  renderCard,
  onCard,
  words,
}: {
  c: Character;
  perPage: number;
  order?: readonly string[] | undefined;
  kindLabel?: ((kind: string) => ReactNode) | undefined;
  renderCard?: ((card: DeckCard) => ReactNode) | undefined;
  onCard?: ((id: string) => void) | undefined;
  words: SelectWords;
}) {
  const [kind, setKind] = useState('ALL');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const deck = c.deck ?? [];
  const shown = deckPage(deck, kind, query, page, perPage);
  return (
    <section data-part="deck">
      <h2>
        <span>{words.deck(c)}</span>
        <input
          type="search"
          data-part="search"
          value={query}
          placeholder={words.search}
          aria-label={words.search}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </h2>
      <div data-part="tabs" role="group">
        {deckTabs(deck, order).map((t) => (
          <button
            key={t.kind}
            type="button"
            data-part="tab"
            data-kind={t.kind}
            data-on={kind === t.kind ? 'yes' : 'no'}
            aria-pressed={kind === t.kind}
            onClick={() => {
              setKind(t.kind);
              setPage(0);
            }}
          >
            {t.kind === 'ALL' ? words.all : (kindLabel?.(t.kind) ?? t.kind)}
            <small>{t.count}</small>
          </button>
        ))}
      </div>
      <div data-part="row">
        <button
          type="button"
          data-part="prev"
          aria-label={words.prev}
          disabled={shown.page === 0}
          onClick={() => {
            setPage(shown.page - 1);
          }}
        >
          ‹
        </button>
        <div data-part="cards" style={{ '--cs-per-page': String(perPage) } as CSSProperties}>
          {shown.cards.length === 0 ? (
            <div data-part="empty">{words.empty(c)}</div>
          ) : (
            shown.cards.map((card) => (
              <button
                key={card.id}
                type="button"
                data-part="card"
                data-kind={card.kind}
                data-card={card.id}
                title={card.name}
                onClick={() => onCard?.(card.id)}
              >
                {renderCard?.(card) ?? card.name}
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          data-part="next"
          aria-label={words.next}
          disabled={shown.page >= shown.pages - 1}
          onClick={() => {
            setPage(shown.page + 1);
          }}
        >
          ›
        </button>
      </div>
      <div data-part="pager">
        {Array.from({ length: shown.pages }, (_, i) => (
          <i key={i} data-on={i === shown.page ? 'yes' : 'no'} />
        ))}
        <span>{words.cards(shown.list)}</span>
      </div>
    </section>
  );
}

/** The whole screen. */
export function CharacterSelect(props: CharacterSelectProps) {
  const {
    roster,
    sets,
    opponents = [],
    modes = [{ id: 'play', label: '' }],
    fields = [],
    statMax = 10,
    phone = false,
    slots = {},
  } = props;
  const words: SelectWords = { ...WORDS, ...props.words };
  const canPick = props.canPick ?? (() => ({ ok: true }));
  const [mode, setMode] = useState(props.initial?.mode ?? modes[0]?.id ?? '');
  const [pick, setPick] = useState(
    props.initial?.pick ?? firstAllowed(roster, null, (id) => canPick(id).ok) ?? roster[0]?.id ?? '',
  );
  const [opp, setOpp] = useState<string | null>(props.initial?.opponent ?? null);
  const [options, setOptions] = useState<Record<string, string | boolean>>(() => ({
    ...Object.fromEntries(fields.map((f) => [f.id, f.kind === 'check' ? false : (f.choices?.[0]?.value ?? '')])),
    ...props.initial?.options,
  }));
  const [open, setOpen] = useState(false);
  const m = modes.find((x) => x.id === mode) ?? modes[0] ?? { id: '', label: '' };
  const draft = choiceOf(m, pick, opp, options, fields);
  const canOppose = (id: string): Allowed =>
    props.canOppose?.(id, draft) ?? { ok: id !== pick };
  const oppId = m.opponents === false ? null : firstAllowed(opponents, opp, (id) => canOppose(id).ok);
  const choice = choiceOf(m, pick, oppId, options, fields);
  const changed = (c: Partial<Choice>): void => {
    props.onChange?.({ ...choice, ...c });
  };
  const c = roster.find((x) => x.id === pick) ?? roster[0];
  const o = opponents.find((x) => x.id === oppId);
  const problems = props.problems?.(choice) ?? [];
  const rich = (t: string, links?: readonly TextLink[]): ReactNode => (
    <RichText text={t} icons={props.icons} links={links} renderGlyph={props.renderGlyph} onCard={props.onCard} />
  );
  const name = c === undefined ? null : splitName(c.name, c.short);
  const screen = (
    <div data-part="character-select" data-layout={phone ? 'phone' : 'wide'} data-mode={m.id}>
      <header data-part="header">
        {slots.header}
        {modes.length > 1 ? (
          <div data-part="modes" role="group">
            {modes.map((x) => (
              <button
                key={x.id}
                type="button"
                data-part="mode"
                data-on={x.id === m.id ? 'yes' : 'no'}
                aria-pressed={x.id === m.id}
                onClick={() => {
                  setMode(x.id);
                  changed({ mode: x.id });
                }}
              >
                {x.label}
              </button>
            ))}
          </div>
        ) : null}
        <p data-part="mode-line">
          {m.line}{' '}
          {fieldsFor(fields, m.id).length === 0 ? null : (
            <button
              type="button"
              data-part="options-toggle"
              aria-expanded={open}
              onClick={() => {
                setOpen((x) => !x);
              }}
            >
              {words.options} {open ? '▴' : '▾'}
            </button>
          )}
        </p>
        {open ? (
          <div data-part="options">
            {slots.options !== undefined
              ? slots.options(choice, (id, v) => {
                  setOptions((x) => ({ ...x, [id]: v }));
                  changed({ options: { ...choice.options, [id]: v } });
                })
              : fieldsFor(fields, m.id).map((f) => {
              const set = (v: string | boolean): void => {
                setOptions((x) => ({ ...x, [f.id]: v }));
                changed({ options: { ...choice.options, [f.id]: v } });
              };
              const v = options[f.id];
              const own = slots.field?.(f, v, set);
              if (own !== undefined && own !== null)
                return (
                  <div key={f.id} data-part="field" data-kind={f.kind} data-id={f.id} data-slot="yes">
                    <span>{f.label}</span>
                    {own}
                  </div>
                );
              return (
                <label key={f.id} data-part="field" data-kind={f.kind} data-id={f.id}>
                  {f.kind === 'check' ? (
                    <input
                      type="checkbox"
                      checked={v === true}
                      onChange={(e) => {
                        set(e.target.checked);
                      }}
                    />
                  ) : null}
                  <span>{f.label}</span>
                  {f.kind === 'select' ? (
                    <select
                      value={String(v ?? '')}
                      onChange={(e) => {
                        set(e.target.value);
                      }}
                    >
                      {(f.choices ?? []).map((x) => (
                        <option key={x.value} value={x.value} disabled={x.disabled != null}>
                          {x.disabled == null ? x.label : `${x.label} (${x.disabled})`}
                        </option>
                      ))}
                    </select>
                  ) : f.kind === 'text' ? (
                    <input
                      value={String(v ?? '')}
                      onChange={(e) => {
                        set(e.target.value);
                      }}
                    />
                  ) : null}
                </label>
              );
            })}
          </div>
        ) : null}
      </header>
      <Roster
        list={roster}
        sets={sets}
        picked={pick}
        can={canPick}
        plate={slots.plate}
        title={words.roster}
        onPick={(id) => {
          setPick(id);
          changed({ pick: id });
        }}
      />
      {c === undefined || name === null ? null : (
        <section data-part="hero" data-id={c.id} key={`hero-${c.id}`}>
          <Portrait p={c.portrait} label={c.name} />
          <div data-part="info">
            {slots.plate?.(c, 'hero') ?? (
              <>
                <div data-part="first">{name.first}</div>
                <div data-part="last">{name.last}</div>
              </>
            )}
            <Meter n={c.stat} max={statMax} line={c.statLine} />
            {c.meta === undefined ? null : <div data-part="meta">{c.meta}</div>}
            {slots.sub?.(c, choice)}
            {phone || c.summary === undefined ? null : (
              <Summary summary={c.summary} full={c.full} rich={(t) => rich(t, c.links)} words={words} />
            )}
          </div>
          {phone && c.summary !== undefined ? (
            <Summary summary={c.summary} full={c.full} rich={(t) => rich(t, c.links)} words={words} />
          ) : null}
        </section>
      )}
      <div data-part="side">
        {c === undefined || c.deck === undefined ? null : (
          <DeckBrowser
            key={c.id}
            c={c}
            perPage={props.perPage ?? (phone ? 3 : 5)}
            order={props.kindOrder}
            kindLabel={props.kindLabel}
            renderCard={props.renderCard}
            onCard={props.onCard}
            words={words}
          />
        )}
        {c === undefined || slots.track === undefined ? null : <section data-part="track">{slots.track(c, choice)}</section>}
      </div>
      <section data-part="opponents">
        {m.opponents === false ? (
          <div data-part="opponent-note">{m.note}</div>
        ) : (
          <>
            {o === undefined ? null : (
              <div data-part="opponent" data-id={o.id} key={`opp-${o.id}`}>
                <h2>{words.opponent}</h2>
                {slots.plate?.(o, 'opponent') ?? <div data-part="opponent-name">{o.name}</div>}
                {o.meta === undefined ? null : <div data-part="meta">{o.meta}</div>}
                {o.summary === undefined ? null : (
                  <Summary summary={o.summary} full={o.full} rich={(t) => rich(t)} words={words} />
                )}
              </div>
            )}
            <div data-part="opponent-strip" role="group">
              {opponents.map((x) => {
                const s = canOppose(x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    data-part="opponent-pick"
                    data-id={x.id}
                    data-on={x.id === oppId ? 'yes' : 'no'}
                    aria-pressed={x.id === oppId}
                    disabled={!s.ok}
                    title={s.why ?? undefined}
                    onClick={() => {
                      setOpp(x.id);
                      changed({ opponent: x.id });
                    }}
                  >
                    <Portrait p={x.portrait} />
                    <b>{x.name}</b>
                    {x.statLine === undefined ? null : <small>{x.statLine}</small>}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div data-part="go">
          {problems.length > 0 ? <p data-part="problems">{problems.join(' ')}</p> : null}
          <button
            type="button"
            data-part="begin"
            disabled={problems.length > 0}
            onClick={() => {
              props.onBegin(choice);
            }}
          >
            {words.begin}
          </button>
        </div>
      </section>
    </div>
  );
  return <>{slots.frame?.(screen) ?? screen}</>;
}
