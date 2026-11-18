import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { writeProofSheet } from "./cli.ts";

test("writes a static HTML sheet using the game module and pack", async () => {
  const dir = mkdtempSync(join(tmpdir(), "proof-sheet-"));
  try {
    const game = join(dir, "game.mjs");
    const pack = join(dir, "cards.json");
    const output = join(dir, "sheet", "index.html");
    writeFileSync(pack, JSON.stringify([{ id: "a", words: "<Sample>" }]));
    writeFileSync(
      game,
      `
      import { readFile } from 'node:fs/promises';
      export async function loadProof(packPath) {
        return {
          title: 'Audit & review',
          cards: JSON.parse(await readFile(packPath, 'utf8')),
          id: (card) => card.id,
          group: () => 'Group',
          renderFace: (card) => 'Face ' + card.id,
          printed: (card) => card.words,
          lazyFaces: true,
        };
      }
    `,
    );
    await writeProofSheet(game, pack, output);
    const html = readFileSync(output, "utf8");
    for (const text of [
      "<!doctype html>",
      "<title>Audit &amp; review</title>",
      "Group (1)",
      "Face a",
      "&lt;Sample&gt;",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("<script");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
