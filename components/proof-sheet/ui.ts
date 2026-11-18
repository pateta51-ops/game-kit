import {
  createElement as h,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  flagsFor,
  proofGroups,
  toggleFilter,
  viewFromHash,
  viewToHash,
  type ProofSpec,
  type ProofView,
} from "./index.ts";

export interface ProofSheetProps<Card> extends ProofSpec<Card> {
  cards: readonly Card[];
  renderFace: (card: Card) => ReactNode;
  fields?: readonly { label: string; get: (card: Card) => ReactNode }[];
  printed?: (card: Card) => ReactNode;
  generated?: (card: Card) => ReactNode;
  data?: (card: Card) => unknown;
  title?: string;
  children?: ReactNode;
  lazyFaces?: boolean;
  foldFilters?: boolean;
}

function WhenNear({ render }: { render: () => ReactNode }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (near || element === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [near, element]);
  return h("div", { ref: setElement }, near ? render() : null);
}

function CardRow<Card>({
  card,
  props,
}: {
  card: Card;
  props: ProofSheetProps<Card>;
}) {
  const id = props.id(card);
  const name = props.name?.(card) ?? id;
  const number = props.number?.(card);
  const flags = flagsFor(card, props.checks ?? []);
  const printed = props.printed?.(card);
  const generated = props.generated?.(card);
  const data = props.data?.(card);
  return h(
    "article",
    { className: "proof-card", "data-card": id },
    h(
      "div",
      { className: "proof-faces" },
      props.lazyFaces
        ? h(WhenNear, { render: () => props.renderFace(card) })
        : props.renderFace(card),
    ),
    h(
      "div",
      { className: "proof-data" },
      h("h3", null, name, number ? h("small", null, " ", number) : null),
      name !== id ? h("code", null, id) : null,
      flags.length
        ? h(
            "ul",
            { className: "proof-flags", "aria-label": "Flags" },
            flags.map((flag) =>
              h("li", { key: flag.id, "data-flag": flag.id }, flag.label),
            ),
          )
        : null,
      props.fields?.length
        ? h(
            "table",
            { "aria-label": "Card data" },
            h(
              "tbody",
              null,
              props.fields.map((field) =>
                h(
                  "tr",
                  { key: field.label },
                  h("th", { scope: "row" }, field.label),
                  h("td", null, field.get(card)),
                ),
              ),
            ),
          )
        : null,
      printed != null && printed !== ""
        ? h("section", null, h("h4", null, "Printed words"), printed)
        : null,
      generated != null && generated !== ""
        ? h("section", null, h("h4", null, "Generated words"), generated)
        : null,
      data !== undefined
        ? h(
            "details",
            null,
            h("summary", null, "Data"),
            h("pre", null, JSON.stringify(data, null, 2)),
          )
        : null,
    ),
  );
}

export function ProofPage<Card>(
  props: ProofSheetProps<Card> & { view?: ProofView; controls?: ReactNode },
) {
  const groups = proofGroups(props.cards, props, props.view);
  const shown = groups.reduce((total, group) => total + group.cards.length, 0);
  return h(
    "main",
    { className: "proof-sheet" },
    h("h1", null, props.title ?? "Proof sheet"),
    props.controls,
    h(
      "p",
      { className: "proof-count", "aria-live": "polite" },
      `Showing ${shown} of ${props.cards.length} cards`,
    ),
    shown === 0 ? h("p", null, "No cards to show.") : null,
    groups.map(({ label, cards }) =>
      h(
        "section",
        { key: label, className: "proof-group" },
        label ? h("h2", null, `${label} (${cards.length})`) : null,
        cards.map((card) =>
          h(CardRow<Card>, { key: props.id(card), card, props }),
        ),
      ),
    ),
    props.children,
  );
}

const subscribe = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => {
    window.removeEventListener("hashchange", notify);
  };
};
const currentHash = () => window.location.hash;
const serverHash = () => "";

function Controls<Card>({
  props,
  view,
  update,
}: {
  props: ProofSheetProps<Card>;
  view: ProofView;
  update: (view: ProofView) => void;
}) {
  const filters = (props.filters ?? []).map(
    ({ id, label, values, options }) => ({
      id,
      label,
      options:
        options ??
        [...new Set(props.cards.flatMap(values))].map((value) => ({
          id: value,
          label: value,
        })),
    }),
  );
  if (props.checks?.length) {
    filters.push({
      id: "flags",
      label: "Flags",
      options: props.checks.map(({ id, label }) => ({
        id,
        label: typeof label === "string" ? label : id,
      })),
    });
  }
  const controls = h(
    "div",
    { className: "proof-controls" },
    h(
      "label",
      null,
      "Search ",
      h("input", {
        type: "search",
        value: view.q,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          update({ ...view, q: e.currentTarget.value });
        },
      }),
    ),
    props.sorts?.length
      ? h(
          "label",
          null,
          "Sort ",
          h(
            "select",
            {
              value: view.sort,
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                update({ ...view, sort: e.currentTarget.value });
              },
            },
            h("option", { value: "" }, "Grouped"),
            props.sorts.map(({ id, label }) =>
              h("option", { key: id, value: id }, label),
            ),
          ),
        )
      : null,
    view.sort && props.sorts?.some(({ id }) => id === view.sort)
      ? h(
          "button",
          {
            type: "button",
            onClick: () => {
              update({ ...view, dir: view.dir === "desc" ? "asc" : "desc" });
            },
          },
          view.dir === "desc" ? "Descending" : "Ascending",
        )
      : null,
    filters.map(({ id, label, options }) =>
      h(
        "fieldset",
        { key: id },
        h("legend", null, label),
        options.map((option) => {
          const selected = view.filters?.[id] ?? [];
          return h(
            "button",
            {
              key: option.id,
              type: "button",
              "aria-pressed": selected.includes(option.id),
              onClick: () => {
                update({
                  ...view,
                  filters: {
                    ...view.filters,
                    [id]: toggleFilter(selected, option.id),
                  },
                });
              },
            },
            option.label,
          );
        }),
      ),
    ),
    view.q || Object.values(view.filters ?? {}).some((values) => values.length)
      ? h(
          "button",
          {
            type: "button",
            onClick: () => {
              update({ ...view, filters: {}, q: "" });
            },
          },
          "Clear filters",
        )
      : null,
  );
  return props.foldFilters
    ? h("details", null, h("summary", null, "Filter and sort"), controls)
    : controls;
}

export function ProofSheet<Card>(props: ProofSheetProps<Card>) {
  const hash = useSyncExternalStore(subscribe, currentHash, serverHash);
  const view = viewFromHash(hash);
  const update = (next: ProofView) => {
    const oldURL = window.location.href;
    const nextHash = viewToHash(currentHash(), next);
    if (nextHash === currentHash()) return;
    window.history.replaceState(
      window.history.state,
      "",
      nextHash || window.location.pathname + window.location.search,
    );
    window.dispatchEvent(
      new HashChangeEvent("hashchange", {
        oldURL,
        newURL: window.location.href,
      }),
    );
  };
  return h(ProofPage<Card>, {
    ...props,
    view,
    controls: h(Controls<Card>, { props, view, update }),
  });
}
