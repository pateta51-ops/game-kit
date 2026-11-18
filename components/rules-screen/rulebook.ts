import { z } from "zod";

const id = z.string().min(1);
const src = id.optional();
const point = z.tuple([z.number(), z.number()]);
const size = z.number().positive();
const rect = { x: z.number(), y: z.number(), w: size, h: size };
const asset = z.object({
  kind: z.enum(["face", "icon", "sheet"]),
  id,
  side: id.optional(),
});
const fraction = z.number().min(0).max(1);
const crop = z
  .tuple([fraction, fraction, fraction, fraction])
  .refine(([l, t, r, b]) => l < r && t < b);
const sceneElement = z.discriminatedUnion("t", [
  z
    .object({
      t: z.literal("asset"),
      ...rect,
      asset,
      rot: z.number().optional(),
      crop,
      stack: z.number().int().min(0).optional(),
    })
    .partial({ crop: true }),
  z.object({ t: z.literal("zone"), ...rect, style: z.enum(["fill", "dash"]) }),
  z.object({ t: z.literal("poly"), points: z.array(point).min(3) }),
  z.object({ t: z.literal("box"), ...rect }),
  z.object({ t: z.literal("line"), from: point, to: point }),
  z.object({
    t: z.literal("label"),
    x: z.number(),
    y: z.number(),
    text: z.string(),
    size,
    align: z.enum(["left", "center", "right"]).optional(),
    icon: id.optional(),
  }),
  z.object({
    t: z.literal("plate"),
    ...rect,
    count: z.string(),
    text: z.string(),
  }),
  z.object({
    t: z.literal("letter"),
    x: z.number(),
    y: z.number(),
    r: size,
    text: z.string(),
  }),
]);
const scene = z.object({
  id,
  x0: z.number().optional(),
  y0: z.number().optional(),
  w: size,
  h: size,
  alt: id,
  area: id.optional(),
  els: z.array(sceneElement),
});
const prose = { src, text: z.string() };
const item = z.union([
  z.string(),
  z.object({
    text: z.string(),
    icon: id.optional(),
    bullets: z.array(z.string()).optional(),
  }),
]);
const block = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["h2", "h3"]),
    id,
    text: id,
    icon: id.optional(),
    open: z.boolean().optional(),
  }),
  z.object({ kind: z.enum(["p", "intro", "note"]), ...prose }),
  z.object({
    kind: z.enum(["ul", "ol", "credits"]),
    src,
    items: z.array(item),
    printedNumbers: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("table"),
    src,
    rows: z.array(z.array(z.string())),
    header: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("figure"),
    id,
    src,
    scenes: z.array(scene).min(1),
    callouts: z
      .array(
        z.object({
          ...prose,
          area: id.optional(),
          lead: z.string().optional(),
        }),
      )
      .optional(),
  }),
  z.object({
    kind: z.literal("sheet"),
    src,
    id,
    text: z.string(),
    description: z.string(),
    sides: z.array(z.object({ asset, label: id })).min(1),
  }),
]);

export const rulebookSchema = z.array(block).superRefine((blocks, ctx) => {
  const ids = new Set<string>();
  let chapter = false;
  blocks.forEach((entry, i) => {
    if (entry.kind === "h2") chapter = true;
    if (entry.kind === "h3" && !chapter) {
      ctx.addIssue({
        code: "custom",
        path: [i, "kind"],
        message: "Section needs a chapter",
      });
    }
    if ("id" in entry) {
      if (ids.has(entry.id))
        ctx.addIssue({
          code: "custom",
          path: [i, "id"],
          message: "Duplicate block id",
        });
      ids.add(entry.id);
    }
  });
});

export type Block = z.infer<typeof block>;
export type Rulebook = readonly Block[];
export type Scene = z.infer<typeof scene>;
export type SceneElement = z.infer<typeof sceneElement>;
export type DiagramAsset = z.infer<typeof asset>;

export interface Heading {
  id: string;
  text: string;
  index: number;
  children: Heading[];
}

export function headingTree(book: Rulebook): Heading[] {
  const chapters: Heading[] = [];
  for (const [index, block] of book.entries()) {
    if (block.kind !== "h2" && block.kind !== "h3") continue;
    const heading = { id: block.id, text: block.text, index, children: [] };
    const parent = block.kind === "h3" ? chapters.at(-1) : undefined;
    (parent?.children ?? chapters).push(heading);
  }
  return chapters;
}
