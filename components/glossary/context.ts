import { createContext, useContext, type ReactNode } from 'react';
import { buildIndex, type GlossaryEntry, type GlossaryIndex } from './match';

/** Draws an icon code; `entry` is the one that explains it, if any. Without it the entry's term (or the code) stands in. */
export type RenderIcon = (code: string, entry: GlossaryEntry | undefined) => ReactNode;
export interface Ctx {
  index: GlossaryIndex;
  renderIcon?: RenderIcon;
}
export const GlossaryContext = createContext<Ctx>({ index: buildIndex([]) });
/** The index and icon renderer of the nearest <GlossaryProvider> (an empty index without one). */
export const useGlossary = (): Ctx => useContext(GlossaryContext);
