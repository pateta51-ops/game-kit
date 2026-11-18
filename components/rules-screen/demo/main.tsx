import { createRoot } from "react-dom/client";
import { CardFace } from "../../card-parts/ui.ts";
import { GlossaryProvider, LookupHost } from "../../glossary/ui.ts";
import { RulesScreen, type Rulebook } from "../ui.ts";
import "./theme.css";

const book: Rulebook = [
  { kind: "h2", id: "setup", text: "Setup" },
  { kind: "h3", id: "pieces", text: "Pieces" },
  { kind: "p", text: "Each player takes one Marker and a deck." },
  { kind: "h3", id: "table", text: "Table" },
  { kind: "p", text: "Leave room for a row of cards." },
  { kind: "h2", id: "play", text: "Play" },
  { kind: "h3", id: "draw", text: "Draw" },
  { kind: "p", text: "Draw the top card of the deck." },
  { kind: "h3", id: "read", text: "Read a card" },
  { kind: "p", text: "Read the printed value before placing the card." },
  {
    kind: "figure",
    id: "example",
    scenes: [
      {
        id: "face",
        alt: "Card value example",
        w: 340,
        h: 210,
        els: [
          {
            t: "asset",
            asset: { kind: "face", id: "sample" },
            x: 22,
            y: 12,
            w: 128,
            h: 182,
          },
          { t: "box", x: 36, y: 114, w: 100, h: 37 },
          { t: "line", from: [136, 132], to: [185, 132] },
          { t: "label", x: 194, y: 120, text: "Printed value", size: 17 },
        ],
      },
    ],
    callouts: [{ text: "This card has a printed value of three." }],
  },
  { kind: "h3", id: "place", text: "Place" },
  { kind: "p", text: "Add the card to the end of the row." },
  { kind: "h3", id: "pass", text: "Pass" },
  { kind: "p", text: "Pass to the next player." },
  { kind: "h2", id: "finish", text: "Finish" },
  { kind: "h3", id: "count", text: "Count" },
  { kind: "p", text: "Add the numbers in your row." },
  { kind: "h3", id: "reset", text: "Reset" },
  { kind: "p", text: "Return the pieces to the box." },
];

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <GlossaryProvider
      entries={[
        {
          id: "marker",
          term: "Marker",
          summary: "A piece that identifies a player.",
        },
      ]}
    >
      <RulesScreen
        book={book}
        glossary
        enlargeDiagrams
        renderAsset={() => (
          <CardFace
            layout={{
              w: 128,
              h: 182,
              zones: {
                title: { x: 0, y: 12, w: 128, h: 40 },
                value: { x: 0, y: 102, w: 128, h: 37 },
              },
            }}
            zones={{ title: "Sample card", value: <b>3</b> }}
          />
        )}
      />
      <LookupHost />
    </GlossaryProvider>,
  );
}
