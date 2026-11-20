import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { GlossaryText } from "../glossary/ui.ts";
import { IconText } from "../card-parts/ui.ts";
import { ScreenFrame } from "../screens/ui.ts";
import { Enlargement, RuleScene, type RenderAsset } from "./Diagram.tsx";
import {
  headingTree,
  type Block,
  type Heading,
  type Rulebook,
} from "./rulebook.ts";
import {
  highlight,
  rulesMatching,
  searchRules,
  type RuleHit,
} from "./search.ts";

const defaults = {
  title: "Rules",
  contents: "Contents",
  search: "Search the rules",
  results: "Search results",
  noResults: (query: string) => `No rules match “${query}”.`,
  hits: (count: number) =>
    `${String(count)} ${count === 1 ? "result" : "results"}`,
  enlarge: (name: string) => `Enlarge ${name}`,
  close: "Close",
};

export interface RulesScreenProps {
  book: Rulebook;
  words?: Partial<typeof defaults>;
  /** Draws the search field instead of the default `<input>`; wire value and onChange. */
  search?: (s: { value: string; onChange: (v: string) => void; label: string }) => React.ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
  glossary?: boolean;
  icons?: React.ComponentProps<typeof IconText>["icons"];
  renderText?: (text: string) => ReactNode;
  renderAsset?: RenderAsset;
  plainText?: (text: string) => string;
  target?: string;
  collapsible?: boolean;
  enlargeDiagrams?: boolean;
  bodyAs?: "main" | "div";
  nav?: boolean;
}

function reveal(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  let enclosing = target.closest("details");
  while (enclosing instanceof HTMLDetailsElement) {
    enclosing.open = true;
    enclosing = enclosing.parentElement?.closest("details") ?? null;
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start" });
}

function Jump({ id, children }: { id: string; children: ReactNode }) {
  return (
    <a
      href={`#${encodeURIComponent(id)}`}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        reveal(id);
      }}
    >
      {children}
    </a>
  );
}

function Contents({ headings }: { headings: Heading[] }) {
  return (
    <ol>
      {headings.map((heading) => (
        <li key={heading.id}>
          <Jump id={heading.id}>{heading.text}</Jump>
          {heading.children.length > 0 && (
            <Contents headings={heading.children} />
          )}
        </li>
      ))}
    </ol>
  );
}

function Results({
  hits,
  query,
  words,
  anchor,
}: {
  hits: RuleHit[];
  query: string;
  words: typeof defaults;
  anchor: (index: number) => string;
}) {
  return (
    <div data-part="results">
      <p role="status">
        {hits.length ? words.hits(hits.length) : words.noResults(query.trim())}
      </p>
      {hits.length > 0 && (
        <ol aria-label={words.results}>
          {hits.map((hit) => (
            <li key={hit.index}>
              <Jump id={anchor(hit.index)}>
                {highlight(hit.text, query).map((segment, index) =>
                  segment.match ? (
                    <mark key={index}>{segment.text}</mark>
                  ) : (
                    <Fragment key={index}>{segment.text}</Fragment>
                  ),
                )}
              </Jump>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function RulesScreen({
  book,
  words: labels,
  search,
  back,
  actions,
  glossary,
  icons,
  renderText,
  renderAsset = (asset) => asset.id,
  plainText,
  target,
  collapsible = false,
  enlargeDiagrams = false,
  bodyAs = "main",
  nav = false,
}: RulesScreenProps) {
  const [navOpen, setNavOpen] = useState(false);
  const words = { ...defaults, ...labels };
  const scope = useId();
  const [query, setQuery] = useState("");
  const tree = useMemo(() => headingTree(book), [book]);
  const hits = useMemo(
    () => searchRules(book, query, plainText),
    [book, query, plainText],
  );
  const shown = useMemo(
    () => rulesMatching(book, query, hits),
    [book, query, hits],
  );
  const searching = query.trim() !== "";
  const seen = new Set(
    book.flatMap((block) => ("id" in block ? [block.id] : [])),
  );
  const sourceAnchor = (src: string | undefined) => {
    if (!src || seen.has(src)) return undefined;
    seen.add(src);
    return src;
  };
  const anchor = (index: number) => {
    const block = book[index];
    return block && "id" in block ? block.id : `${scope}-${String(index)}`;
  };

  useEffect(() => {
    const jump = () => {
      if (target) reveal(target);
      else {
        try {
          reveal(decodeURIComponent(window.location.hash.slice(1)));
        } catch {
          /* Ignore malformed escape sequences. */
        }
      }
    };
    jump();
    window.addEventListener("hashchange", jump);
    return () => window.removeEventListener("hashchange", jump);
  }, [target, shown]);

  const text = (value: string): ReactNode =>
    renderText
      ? renderText(value)
      : value.split(/\*\*([^*]+)\*\*/g).map((part, index) => {
          const node = glossary ? (
            <GlossaryText text={part} />
          ) : icons ? (
            <IconText text={part} icons={icons} />
          ) : (
            part
          );
          return index % 2 ? (
            <strong key={index}>{node}</strong>
          ) : (
            <Fragment key={index}>{node}</Fragment>
          );
        });
  const icon = (id: string | undefined) =>
    id ? renderAsset({ kind: "icon", id }, "inline") : null;

  function body(block: Block) {
    switch (block.kind) {
      case "h2":
      case "h3":
        return null;
      case "p":
      case "note":
      case "intro":
        return <p>{text(block.text)}</p>;
      case "ul":
      case "ol":
      case "credits": {
        const List = block.kind === "ol" && !block.printedNumbers ? "ol" : "ul";
        return (
          <List>
            {block.items.map((item, index) => {
              const value = typeof item === "string" ? item : item.text;
              const colon = block.kind === "credits" ? value.indexOf(":") : -1;
              return (
                <li key={index}>
                  {typeof item !== "string" && icon(item.icon)}
                  {colon < 0 ? (
                    text(value)
                  ) : (
                    <>
                      <strong>{value.slice(0, colon + 1)}</strong>
                      {text(value.slice(colon + 1))}
                    </>
                  )}
                  {typeof item !== "string" && item.bullets && (
                    <ul>
                      {item.bullets.map((bullet, i) => (
                        <li key={i}>{text(bullet)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </List>
        );
      }
      case "table":
        return (
          <table>
            {block.header && (
              <thead>
                <tr>
                  {block.rows[0]?.map((cell, i) => (
                    <th key={i} scope="col">
                      {text(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.slice(block.header ? 1 : 0).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{text(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "figure":
        return (
          <figure data-part="diagram">
            {block.scenes.map((scene) => {
              const picture = (
                <RuleScene
                  scene={scene}
                  renderAsset={renderAsset}
                  renderText={text}
                />
              );
              return (
                <div
                  key={scene.id}
                  data-part="diagram-cell"
                  style={{ gridArea: scene.area }}
                >
                  {enlargeDiagrams ? (
                    <Enlargement
                      label={words.enlarge(scene.alt)}
                      close={words.close}
                      large={
                        <RuleScene
                          scene={scene}
                          renderAsset={renderAsset}
                          renderText={text}
                          context="enlarged"
                        />
                      }
                    >
                      {picture}
                    </Enlargement>
                  ) : (
                    picture
                  )}
                </div>
              );
            })}
            {block.callouts?.map((callout, i) => (
              <div
                key={i}
                id={sourceAnchor(callout.src)}
                tabIndex={-1}
                data-part="callout"
                style={{ gridArea: callout.area }}
              >
                {callout.lead && <strong>{text(callout.lead)} </strong>}
                {text(callout.text)}
              </div>
            ))}
          </figure>
        );
      case "sheet": {
        const descriptionId = `${scope}-${block.id}-description`;
        return (
          <section aria-label={block.text} data-part="sheet">
            <h4>{text(block.text)}</h4>
            <p hidden id={descriptionId}>
              {block.description}
            </p>
            <ul>
              {block.sides.map(({ asset, label }, i) => (
                <li key={i}>
                  <figure>
                    <Enlargement
                      label={words.enlarge(label)}
                      close={words.close}
                      describedBy={descriptionId}
                      large={renderAsset(asset, "enlarged")}
                    >
                      {renderAsset(asset, "inline")}
                    </Enlargement>
                    <figcaption>{label}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </section>
        );
      }
    }
  }

  function blocks(start: number, end: number) {
    return book.slice(start, end).map((block, offset) => {
      const index = start + offset;
      if (!shown.has(index)) return null;
      const src = "src" in block ? sourceAnchor(block.src) : undefined;
      return (
        <div
          key={index}
          id={anchor(index)}
          tabIndex={-1}
          data-part={block.kind}
          data-target={
            target === anchor(index) ||
            (src !== undefined && target === src) ||
            undefined
          }
        >
          {src && <span id={src} tabIndex={-1} />}
          {body(block)}
        </div>
      );
    });
  }

  function section(heading: Heading, end: number, chapter: boolean) {
    if (!shown.has(heading.index)) return null;
    const block = book[heading.index];
    const label = (
      <>
        {icon(block && "icon" in block ? block.icon : undefined)}
        {heading.text}
      </>
    );
    const Title = chapter ? "h2" : "h3";
    const content = (
      <>
        {blocks(heading.index + 1, heading.children[0]?.index ?? end)}
        {heading.children.map((child, i) =>
          section(child, heading.children[i + 1]?.index ?? end, false),
        )}
      </>
    );
    const attrs = {
      id: heading.id,
      tabIndex: -1,
      "data-part": chapter ? "chapter" : "section",
    };
    return collapsible ? (
      <details
        key={heading.id}
        {...attrs}
        open={
          searching || (block && "open" in block && block.open) || undefined
        }
      >
        <summary>
          <Title>{label}</Title>
        </summary>
        {content}
      </details>
    ) : (
      <section key={heading.id} {...attrs}>
        <Title>{label}</Title>
        {content}
      </section>
    );
  }

  return (
    <ScreenFrame
      title={words.title}
      back={back}
      actions={actions}
      bodyAs={bodyAs}
    >
      <div
        data-part="rules-screen"
        data-nav={nav ? (navOpen ? "open" : "closed") : undefined}
      >
        {nav && (
          <button
            type="button"
            data-part="nav-toggle"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(!navOpen)}
          >
            {words.contents}
          </button>
        )}
        {search ? (
          search({ value: query, onChange: setQuery, label: words.search })
        ) : (
          <input
            type="search"
            data-part="search"
            aria-label={words.search}
            placeholder={words.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
        {searching ? (
          <Results hits={hits} query={query} words={words} anchor={anchor} />
        ) : (
          tree.length > 0 && (
            <nav data-part="contents" aria-label={words.contents}>
              <p>{words.contents}</p>
              <Contents headings={tree} />
            </nav>
          )
        )}
        <article data-part="rulebook">
          {blocks(0, tree[0]?.index ?? book.length)}
          {tree.map((heading, index) =>
            section(heading, tree[index + 1]?.index ?? book.length, true),
          )}
        </article>
      </div>
    </ScreenFrame>
  );
}
