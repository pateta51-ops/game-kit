export interface ProofView {
  filters?: Readonly<Record<string, readonly string[]>>;
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
}

export interface ProofFlag {
  id: string;
  label: string;
}

export interface ProofCheck<Card> {
  id: string;
  label: string | ((card: Card) => string);
  test: (card: Card) => boolean;
}

export interface ProofFilter<Card> {
  id: string;
  label: string;
  values: (card: Card) => readonly string[];
  options?: readonly { id: string; label: string }[];
}

export interface ProofSort<Card> {
  id: string;
  label: string;
  value: (card: Card) => string | number | null | undefined;
}

export interface ProofSpec<Card> {
  id: (card: Card) => string;
  name?: (card: Card) => string;
  group?: (card: Card) => string;
  groupOrder?: readonly string[];
  number?: (card: Card) => string;
  search?: (card: Card) => readonly string[];
  filters?: readonly ProofFilter<Card>[];
  checks?: readonly ProofCheck<Card>[];
  sorts?: readonly ProofSort<Card>[];
}

const splitHash = (hash: string) => {
  const i = hash.indexOf("?");
  return i === -1
    ? { route: hash, params: new URLSearchParams() }
    : {
        route: hash.slice(0, i),
        params: new URLSearchParams(hash.slice(i + 1)),
      };
};
const filterPrefix = "filter.";
const viewKeys = ["q", "sort", "dir"];

export function viewFromHash(hash: string): ProofView {
  const { params } = splitHash(hash);
  const filters = new Map<string, string[]>();
  for (const [key, value] of params) {
    if (!key.startsWith(filterPrefix)) continue;
    const id = key.slice(filterPrefix.length);
    const selected = filters.get(id) ?? [];
    selected.push(value);
    filters.set(id, selected);
  }
  const dir = params.get("dir");
  return {
    filters: Object.fromEntries(filters),
    q: params.get("q") ?? "",
    sort: params.get("sort") ?? "",
    dir: dir === "desc" ? "desc" : "asc",
  };
}

export function viewToHash(hash: string, view: ProofView): string {
  const { route, params } = splitHash(hash);
  for (const key of new Set(params.keys())) {
    if (viewKeys.includes(key) || key.startsWith(filterPrefix))
      params.delete(key);
  }
  for (const [id, values] of Object.entries(view.filters ?? {})) {
    for (const value of values) params.append(filterPrefix + id, value);
  }
  if (view.q) params.set("q", view.q);
  if (view.sort) params.set("sort", view.sort);
  if (view.dir === "desc") params.set("dir", view.dir);
  const query = params.toString();
  return query ? `${route || "#"}?${query}` : route;
}

export function flagsFor<Card>(
  card: Card,
  checks: readonly ProofCheck<Card>[],
): ProofFlag[] {
  return checks
    .filter((check) => check.test(card))
    .map(({ id, label }) => ({
      id,
      label: typeof label === "function" ? label(card) : label,
    }));
}

export function toggleFilter(
  values: readonly string[],
  value: string,
): string[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}

const fold = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const compare = (a: string, b: string): number =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });

export function filterCards<Card>(
  cards: readonly Card[],
  spec: ProofSpec<Card>,
  view: ProofView,
): Card[] {
  const q = fold((view.q ?? "").trim());
  const filters = spec.filters ?? [];
  const flags = view.filters?.flags ?? [];
  return cards.filter(
    (card) =>
      (!q ||
        [
          spec.id(card),
          spec.name?.(card) ?? "",
          spec.number?.(card) ?? "",
          ...(spec.search?.(card) ?? []),
        ].some((text) => fold(text).includes(q))) &&
      filters.every(({ id, values }) => {
        const selected = view.filters?.[id];
        return (
          !selected?.length ||
          values(card).some((value) => selected.includes(value))
        );
      }) &&
      (!flags.length ||
        flagsFor(card, spec.checks ?? []).some(({ id }) => flags.includes(id))),
  );
}

export interface ProofGroup<Card> {
  label: string;
  cards: Card[];
}

export function proofGroups<Card>(
  cards: readonly Card[],
  spec: ProofSpec<Card>,
  view: ProofView = {},
): ProofGroup<Card>[] {
  const groups = new Map<string, ProofGroup<Card>>();
  const sort = spec.sorts?.find(({ id }) => id === view.sort);
  const byNumber = (a: Card, b: Card) =>
    compare(spec.number?.(a) ?? "", spec.number?.(b) ?? "") ||
    compare(spec.id(a), spec.id(b));
  const shown = filterCards(cards, spec, view);
  if (sort && shown.length) {
    shown.sort((a, b) => {
      const left = sort.value(a);
      const right = sort.value(b);
      if (left == null || right == null) {
        return Number(left == null) - Number(right == null) || byNumber(a, b);
      }
      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : compare(String(left), String(right));
      return (view.dir === "desc" ? -order : order) || byNumber(a, b);
    });
    return [{ label: "", cards: shown }];
  }
  for (const card of shown) {
    const label = spec.group?.(card) ?? "";
    let group = groups.get(label);
    if (!group) {
      group = { label, cards: [] };
      groups.set(label, group);
    }
    group.cards.push(card);
  }
  const ranks = new Map(spec.groupOrder?.map((label, i) => [label, i]));
  return [...groups.values()]
    .map((group) => ({ ...group, cards: group.cards.sort(byNumber) }))
    .sort(
      (a, b) =>
        (ranks.get(a.label) ?? ranks.size) -
          (ranks.get(b.label) ?? ranks.size) || compare(a.label, b.label),
    );
}
