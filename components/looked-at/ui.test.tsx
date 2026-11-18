// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useState } from "react";
import type { Peek } from "./index.ts";
import { LookedAt } from "./ui.ts";

const cards = ["a", "b", "c"].map((cardId) => ({
  cardId,
  zone: "deck",
  when: 1,
}));
const renderCard = (peek: Peek) => <span>{peek.cardId}</span>;

it("renders each remembered card through the game's renderer", () => {
  const face = vi.fn(renderCard);
  const view = render(
    <LookedAt
      cards={cards}
      renderCard={face}
      onClose={vi.fn()}
      words={{ title: "Known faces" }}
    />,
  );
  expect(view.getByRole("dialog", { name: "Known faces" })).toBeTruthy();
  expect(face.mock.calls).toEqual(cards.map((card) => [card]));
  expect(view.getAllByRole("listitem").map((item) => item.textContent)).toEqual(
    ["a", "b", "c"],
  );
});

it("closes on Escape", () => {
  function Example() {
    const [open, setOpen] = useState(true);
    return open ? (
      <LookedAt
        cards={cards}
        renderCard={renderCard}
        onClose={() => setOpen(false)}
      />
    ) : null;
  }
  const view = render(<Example />);
  fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape" });
  expect(view.queryByRole("dialog")).toBeNull();
});

it("closes on the overlay or close button and keeps clicks on a face inside", () => {
  const onClose = vi.fn();
  const view = render(
    <LookedAt cards={cards} renderCard={renderCard} onClose={onClose} />,
  );
  fireEvent.click(view.getByText("a"));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(view.container.firstElementChild as Element);
  fireEvent.click(view.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

it("offers a reopen control only while closed with remembered cards, and shows zone labels", () => {
  const onReopen = vi.fn();
  const closed = render(
    <LookedAt cards={cards} renderCard={renderCard} onClose={vi.fn()} open={false} onReopen={onReopen} words={{ reopen: "Again" }} />,
  );
  expect(closed.queryByRole("dialog")).toBeNull();
  fireEvent.click(closed.getByRole("button", { name: "Again" }));
  expect(onReopen).toHaveBeenCalledTimes(1);
  closed.unmount();
  const empty = render(
    <LookedAt cards={[]} renderCard={renderCard} onClose={vi.fn()} open={false} onReopen={onReopen} />,
  );
  expect(empty.queryByRole("button")).toBeNull();
  empty.unmount();
  const none = render(<LookedAt cards={cards} renderCard={renderCard} onClose={vi.fn()} />);
  expect(none.container.querySelector(".kla-zone")).toBeNull();
  none.unmount();
  const labelled = render(
    <LookedAt cards={cards} renderCard={renderCard} onClose={vi.fn()} zoneLabel={(z) => `in ${z}`} />,
  );
  expect(labelled.getAllByText("in deck")).toHaveLength(3);
});
