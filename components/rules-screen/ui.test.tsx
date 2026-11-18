// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GlossaryProvider } from "../glossary/ui.ts";
import { RulesScreen, type Rulebook } from "./ui.ts";

const book: Rulebook = [
  { kind: "h2", id: "play", text: "Play" },
  { kind: "h3", id: "setup", text: "Setup" },
  { kind: "p", text: "Place a Marker." },
  { kind: "p", text: "Return the marker to the box." },
  {
    kind: "figure",
    id: "example",
    scenes: [
      {
        id: "front",
        w: 100,
        h: 120,
        alt: "Sample face",
        els: [
          {
            t: "asset",
            asset: { kind: "face", id: "sample" },
            x: 10,
            y: 10,
            w: 60,
            h: 90,
          },
          { t: "box", x: 15, y: 20, w: 45, h: 20 },
        ],
      },
    ],
    callouts: [{ text: "Read the boxed value." }],
  },
  { kind: "h3", id: "scoring", text: "Scoring" },
  { kind: "p", text: "Count the points." },
];

it("renders sections, a face through the render prop, its overlay, and glossary links", () => {
  const asset = vi.fn(({ id }: { id: string }) => <span>{id}</span>);
  render(
    <GlossaryProvider
      entries={[{ id: "marker", term: "Marker", summary: "A small piece." }]}
    >
      <RulesScreen book={book} glossary renderAsset={asset} />
    </GlossaryProvider>,
  );
  expect(screen.getByRole("heading", { name: "Setup" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Scoring" })).toBeTruthy();
  expect(asset).toHaveBeenCalledWith({ kind: "face", id: "sample" }, "inline");
  const scene = screen.getByRole("img", { name: "Sample face" });
  expect(within(scene).getByText("sample")).toBeTruthy();
  expect(scene.querySelector('[data-part="overlay"] rect')).toBeTruthy();
  expect(screen.getByText("Read the boxed value.")).toBeTruthy();
  expect(
    screen.getAllByText(/^marker$/i, { selector: ".kit-glo-link" }).length,
  ).toBeGreaterThan(0);
});

it("jumps through contents and shows two marked results with their section", () => {
  const scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  const { container } = render(<RulesScreen book={book} collapsible />);
  fireEvent.click(screen.getByRole("link", { name: "Setup" }));
  expect(container.querySelector("details#setup")?.hasAttribute("open")).toBe(
    true,
  );
  expect(container.querySelector("details#play")?.hasAttribute("open")).toBe(
    true,
  );
  expect(scrollIntoView).toHaveBeenCalled();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "marker" },
  });
  expect(screen.getByRole("status").textContent).toBe("2 results");
  expect(container.querySelectorAll("mark")).toHaveLength(2);
  expect(screen.queryByRole("heading", { name: "Scoring" })).toBeNull();
});
