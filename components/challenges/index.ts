export interface Challenge<R = unknown, E = unknown, A = unknown> {
  id: string
  name: string
  text: string
  restriction?: R
  penalties: { on: E; effect: A }[]
}

export type ChallengeGame<S, R, E> = {
  allows: (restriction: R, setup: S) => boolean
  matches: (on: E, event: E) => boolean
}

export const challengeOk = <S, R, E, A>(g: ChallengeGame<S, R, E>, c: Challenge<R, E, A>, setup: S): boolean =>
  c.restriction === undefined || g.allows(c.restriction, setup)

export const pickable = <S, R, E, A>(g: ChallengeGame<S, R, E>, all: readonly Challenge<R, E, A>[], setup: S): Challenge<R, E, A>[] =>
  all.filter((c) => challengeOk(g, c, setup))

export const pickChallenge = <S, R, E, A>(g: ChallengeGame<S, R, E>, all: readonly Challenge<R, E, A>[], id: string | undefined, setup: S): Challenge<R, E, A> | undefined => {
  if (id === undefined) return undefined
  const c = all.find((x) => x.id === id)
  return c && challengeOk(g, c, setup) ? c : undefined
}

export const penaltiesFor = <S, R, E, A>(g: ChallengeGame<S, R, E>, c: Challenge<R, E, A> | undefined, event: E): A[] =>
  c ? c.penalties.filter((p) => g.matches(p.on, event)).map((p) => p.effect) : []
