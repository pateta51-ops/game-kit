import { expect, it } from "vitest";
import { forgetCard, knownInZone, recordPeek } from "./index.ts";

const peek = { cardId: "a", zone: "deck", when: 1 };

it("records an explicit peek and replaces it on a repeat peek", () => {
  const memory = recordPeek([], peek);
  const updated = { ...peek, when: 2 };
  expect(recordPeek(memory, updated)).toEqual([updated]);
  expect(memory).toEqual([peek]);
});

it.each(["moves", "is revealed"])("forgets only the card that %s", () => {
  const other = { ...peek, cardId: "b" };
  const memory = recordPeek([peek], other);
  expect(forgetCard(memory, "a")).toEqual([other]);
  expect(memory).toEqual([peek, other]);
});

it("lists known cards only in the requested zone, in recording order", () => {
  const other = { ...peek, cardId: "b", zone: "table" };
  const later = { ...peek, cardId: "c", when: 2 };
  const memory = [peek, other, later];
  expect(knownInZone(memory, "deck")).toEqual([peek, later]);
  expect(knownInZone(memory, "table")).toEqual([other]);
  expect(knownInZone(memory, "unknown")).toEqual([]);
});

it("round-trips through a JSON save", () => {
  const memory = recordPeek([], peek);
  expect(JSON.parse(JSON.stringify(memory))).toEqual(memory);
});
