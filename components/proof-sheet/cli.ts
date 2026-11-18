import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProofPage, type ProofSheetProps } from "./ui.ts";

export type LoadProof<Card> = (
  packPath: string,
  outputPath: string,
) => ProofSheetProps<Card> | Promise<ProofSheetProps<Card>>;

export async function writeProofSheet(
  modulePath: string,
  packPath: string,
  outputPath = "proof/index.html",
): Promise<void> {
  const game = (await import(pathToFileURL(resolve(modulePath)).href)) as {
    loadProof?: LoadProof<unknown>;
  };
  if (typeof game.loadProof !== "function")
    throw new Error("The game module must export loadProof.");
  const output = resolve(outputPath);
  const props = await game.loadProof(resolve(packPath), output);
  const title = renderToStaticMarkup(
    createElement("title", null, props.title ?? "Proof sheet"),
  );
  const body = renderToStaticMarkup(
    createElement(ProofPage<unknown>, { ...props, lazyFaces: false }),
  );
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${title}<style>.proof-card{display:flex;flex-wrap:wrap;gap:1rem;margin-block:1rem}.proof-data{min-width:0}pre{white-space:pre-wrap}</style></head><body>${body}</body></html>\n`;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
}

async function main([
  modulePath,
  packPath,
  outputPath = "proof/index.html",
]: string[]) {
  if (!modulePath || !packPath) {
    throw new Error("Usage: node cli.ts <game-module> <pack> [output.html]");
  }
  await writeProofSheet(modulePath, packPath, outputPath);
  console.log(`proof: wrote ${outputPath}`);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
