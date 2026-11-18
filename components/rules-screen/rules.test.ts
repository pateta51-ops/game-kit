import { describe, expect, it } from "vitest";
import {
  headingTree,
  highlight,
  rulebookSchema,
  rulesMatching,
  searchRules,
  type Rulebook,
} from "./index.ts";

const book: Rulebook = [
  { kind: "h2", id: "play", text: "Play" },
  { kind: "h3", id: "spend", text: "Spend" },
  { kind: "p", text: "Spend two tokens to draw a card." },
  { kind: "p", text: "A card is drawn by spending." },
  { kind: "h3", id: "return", text: "Return" },
  { kind: "p", text: "Return the [BLUE_TOKEN]." },
  { kind: "h2", id: "finish", text: "Finish" },
];

describe("rulebook data", () => {
  it("validates book data and rejects invalid types, orphan sections, duplicate IDs and invalid scene bounds", () => {
    expect(rulebookSchema.safeParse(book).success).toBe(true);
    expect(rulebookSchema.safeParse([{ kind: "p", text: 2 }]).success).toBe(
      false,
    );
    expect(rulebookSchema.safeParse([book[1]]).success).toBe(false);
    expect(rulebookSchema.safeParse([book[0], book[0]]).success).toBe(false);
    expect(
      rulebookSchema.safeParse([
        {
          kind: "figure",
          id: "demo",
          scenes: [{ id: "scene", w: 0, h: 20, alt: "Demo", els: [] }],
        },
      ]).success,
    ).toBe(false);
  });

  it("groups sections under chapters in document order", () => {
    expect(headingTree(book)).toEqual([
      {
        id: "play",
        text: "Play",
        index: 0,
        children: [
          { id: "spend", text: "Spend", index: 1, children: [] },
          { id: "return", text: "Return", index: 4, children: [] },
        ],
      },
      { id: "finish", text: "Finish", index: 6, children: [] },
    ]);
  });
});

describe("rule search", () => {
  it("ranks phrases before partial words, and reads icon names", () => {
    expect(searchRules(book, "draw a card").map(({ index }) => index)).toEqual([
      2, 3,
    ]);
    expect(searchRules(book, "blue token").map(({ index }) => index)).toEqual([
      5,
    ]);
  });

  it("keeps matching blocks, ancestors and the children of a matching heading", () => {
    expect([...rulesMatching(book, "blue token")].sort()).toEqual([0, 4, 5]);
    expect([...rulesMatching(book, "play")]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rulesMatching(book, "").size).toBe(book.length);
  });

  it("highlights matched runs without changing casing or punctuation", () => {
    expect(highlight("Draw, then draw.", "draw")).toEqual([
      { text: "Draw", match: true },
      { text: ", then ", match: false },
      { text: "draw", match: true },
      { text: ".", match: false },
    ]);
  });
});
