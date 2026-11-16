export type PickedState = 'picked' | 'unpicked' | 'none'

export const pickedState = (picked: boolean, anyPicked: boolean): PickedState => (picked ? 'picked' : anyPicked ? 'unpicked' : 'none')

export const pickedAttrs = (picked: boolean, anyPicked: boolean): { 'data-picked'?: PickedState } => {
  const s = pickedState(picked, anyPicked)
  return s === 'none' ? {} : { 'data-picked': s }
}

export const pickedStates = <T,>(options: readonly T[], isPicked: (o: T) => boolean): PickedState[] => {
  const any = options.some(isPicked)
  return options.map((o) => pickedState(isPicked(o), any))
}
