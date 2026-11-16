import { createContext, useContext } from 'react'

export const ArtContext = createContext<{ art: unknown; tick: number } | null>(null)

/** The art of the ArtProvider above; drawing cards outside one is a bug. */
export function useArt<A>(): A {
  const v = useContext(ArtContext)
  if (v === null) throw new Error('useArt: no ArtProvider above this card')
  return v.art as A
}
