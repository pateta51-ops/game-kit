// @vitest-environment jsdom
import { createElement as h } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import {
  flagsFor,
  proofGroups,
  viewFromHash,
  viewToHash,
  type ProofSpec,
} from "./index.ts";
import { ProofSheet } from "./ui.ts";

const cards = [
  { id: "b1", group: "B", number: "1", name: "Blue", cost: null },
  { id: "a10", group: "A", number: "10", name: "Amber", cost: 2 },
  { id: "a2", group: "A", number: "2", name: "Écru", cost: 5 },
];
type Card = (typeof cards)[number];

const spec: ProofSpec<Card> = {
  id: (card) => card.id,
  name: (card) => card.name,
  group: (card) => card.group,
  groupOrder: ["B", "A"],
  number: (card) => card.number,
  filters: [{ id: "set", label: "Set", values: (card) => [card.group] }],
  checks: [
    {
      id: "missing",
      label: (card) => `Missing cost for ${card.name}`,
      test: (card) => card.cost === null,
    },
  ],
  sorts: [{ id: "cost", label: "Cost", value: (card) => card.cost }],
};

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", window.location.pathname);
});

test("groups in declared order and sorts by printed number within a group", () => {
  expect(
    proofGroups(cards, spec).map(({ label, cards }) => [
      label,
      cards.map(({ id }) => id),
    ]),
  ).toEqual([
    ["B", ["b1"]],
    ["A", ["a2", "a10"]],
  ]);
  expect(cards.map(({ id }) => id)).toEqual(["b1", "a10", "a2"]);
});

test("combines facets with accent-insensitive search and omits empty groups", () => {
  expect(
    proofGroups(cards, spec, { filters: { set: ["A", "B"] }, q: " ecru " }),
  ).toEqual([{ label: "A", cards: [cards[2]] }]);
  expect(
    proofGroups(cards, spec, { filters: { set: ["A"], flags: ["missing"] } }),
  ).toEqual([]);
});

test("sorts a flat list, leaving missing numbers last in either direction", () => {
  expect(
    proofGroups(cards, spec, { sort: "cost", dir: "desc" })[0]?.cards,
  ).toEqual([cards[2], cards[1], cards[0]]);
  expect(proofGroups(cards, spec, { sort: "cost" })[0]?.cards).toEqual([
    cards[1],
    cards[2],
    cards[0],
  ]);
});

test("round-trips hash filters, search and sort without replacing route or pack", () => {
  const view = {
    filters: { set: ["A & B", "É+"], ["__proto__"]: ["safe"] },
    q: " text?# ",
    sort: "cost",
    dir: "desc",
  } as const;
  const hash = viewToHash("#/proof?pack=one&filter.set=old", view);
  expect(hash).toMatch(/^#\/proof\?pack=one&/);
  expect(viewFromHash(hash)).toEqual(view);
  expect(viewToHash(hash, {})).toBe("#/proof?pack=one");
});

test("evaluates the game checks and filters by their flag ids", () => {
  expect(flagsFor(cards[0]!, spec.checks!)).toEqual([
    { id: "missing", label: "Missing cost for Blue" },
  ]);
  expect(flagsFor(cards[1]!, spec.checks!)).toEqual([]);
  expect(proofGroups(cards, spec, { filters: { flags: ["missing"] } })).toEqual(
    [{ label: "B", cards: [cards[0]] }],
  );
});

test("renders game faces and comparison data and updates the hash from controls", () => {
  window.history.replaceState(null, "", "#/proof?pack=one&filter.set=B");
  render(
    h(ProofSheet<Card>, {
      ...spec,
      cards,
      renderFace: (card) => h("figure", null, `Face ${card.name}`),
      fields: [{ label: "Cost", get: (card) => card.cost ?? "None" }],
      printed: (card) => `Printed ${card.name}`,
      generated: (card) => `Generated ${card.name}`,
    }),
  );
  expect(screen.getByText("Showing 1 of 3 cards")).toBeTruthy();
  for (const text of [
    "Face Blue",
    "Missing cost for Blue",
    "None",
    "Printed Blue",
    "Generated Blue",
  ]) {
    expect(screen.getByText(text)).toBeTruthy();
  }
  expect(screen.getByRole("rowheader", { name: "Cost" })).toBeTruthy();
  expect(screen.queryByText("Face Amber")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "A" }));
  expect(viewFromHash(window.location.hash).filters).toEqual({
    set: ["B", "A"],
  });
  expect(screen.getByText("Face Amber")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(window.location.hash).toBe("#/proof?pack=one");
});
