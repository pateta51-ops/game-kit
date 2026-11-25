// K234: the one game object as sim-pool's game module, its driver and replay-cli's engine (node only: sim-pool loads node modules).
import type { GameTypes } from '../engine-core/index.ts';
import { botDriver, DriverRegistrationError, randomDriver, type Bot, type Driver, type DriverRng, type GameSpec, type SimGame, type ValidateDriverView } from '../sim-pool/index.ts';
import type { ReplayEngine } from '../replay-cli/replay.ts';
import { answerOf, type GameDef, type SeatId } from './index.ts';

/** The opponent as a sim-pool driver: it reads `view(state, prompt.seat)` only. */
export function opponentDriverOf<G extends GameTypes, V, S extends SeatId>(def: GameDef<G, V, S>): Driver<G> {
  const choose = (state: G['state'], answers: readonly G['action'][], rng: DriverRng, validate?: ValidateDriverView) => {
    const p = state.prompt as G['prompt'];
    if (def.opponent === undefined) throw new Error('This game has no opponent.');
    const view = () => def.view(state, p.seat as S);
    const picks = def.opponent(validate ? validate(p.seat, view) : view(), p, rng);
    return answers.find((a) => a.kind === 'answer' && a.picks.join() === picks.join()) ?? answerOf(p.id, picks);
  };
  return {
    name: 'opponent',
    choose,
    chooseWithViewValidation: choose,
    reasons: () => [],
  };
}

/** K271: a `Bot` as a sim-pool driver over the game's `view`; with driver name `opponent` it answers as `botOpponent` in the store. */
export const botDriverOf = <G extends GameTypes, V, S extends SeatId>(def: GameDef<G, V, S>, bot: Bot<V, G['action']>): Driver<G> => botDriver<G, V>(bot, def.view);

/** sim-pool's game module with registered drivers and public observations for the declared seats. */
export function simGameOf<G extends GameTypes, V, S extends SeatId, Sum = unknown>(
  def: GameDef<G, V, S>,
  o: {
    drivers?: Readonly<Record<string, Driver<G>>>;
    aliases?: Readonly<Record<string, string>>;
    viewValidation?: {
      seats?: readonly S[];
      secrets?: (state: G['state'], seat: S) => readonly string[];
      leakKeys?: (state: G['state'], seat: S) => readonly string[];
    };
    summary?: (state: G['state']) => Sum;
    maxActions?: number;
    start?: (spec: GameSpec) => ReturnType<GameDef<G, V, S>['start']>;
  } = {},
): SimGame<G, Sum> {
  const drivers = new Map<string, () => Driver<G>>(
    Object.entries(o.drivers ?? {}).map(([name, driver]) => [name, () => driver]),
  );
  if (!drivers.has('random')) drivers.set('random', () => randomDriver<G>());
  if (!drivers.has('opponent') && def.opponent !== undefined) drivers.set('opponent', () => opponentDriverOf(def));
  const aliases = new Map(Object.entries(o.aliases ?? {}));
  for (const [alias, target] of aliases) {
    if (!alias || drivers.has(alias) || !drivers.has(target)) {
      throw new DriverRegistrationError(`invalid driver alias ${JSON.stringify(alias)} for ${JSON.stringify(target)}`);
    }
  }
  const available = [...drivers.keys(), ...aliases.keys()].filter(Boolean).sort().join(', ');
  const resolve = (name: string): { key: string; make: () => Driver<G> } => {
    const key = aliases.get(name) ?? name;
    const make = drivers.get(key);
    if (!name || !make) throw new DriverRegistrationError(`unknown driver ${JSON.stringify(name)}; available drivers: ${available}`);
    return { key, make };
  };
  const seats = [...new Set(o.viewValidation?.seats ?? def.seats)];
  const assertions = (state: G['state'], seat: S) => ({
    secrets: o.viewValidation?.secrets?.(state, seat) ?? [],
    leakKeys: o.viewValidation?.leakKeys?.(state, seat) ?? [],
  });
  return {
    rules: def.rules,
    content: () => def.content,
    start: (spec) => (o.start ? o.start(spec) : def.start(spec.seed)),
    validateDriver: (name) => resolve(name).key,
    driver: (name) => resolve(name).make(),
    ...(seats.length === 0 ? {} : {
      observeViews: (state, _content, { cheated }) => seats.map((seat) => ({
        seat,
        read: () => ({
          view: def.view(state, seat, { undoUsed: false, cheated }),
          ...assertions(state, seat),
        }),
      })),
    }),
    driverViewAssertions: (state, seat) => assertions(state, seat as S),
    ...(o.summary === undefined ? {} : { summary: o.summary }),
    ...(o.maxActions === undefined ? {} : { maxActions: o.maxActions }),
  };
}

/** replay-cli's engine. */
export const replayEngineOf = <G extends GameTypes, V, S extends SeatId>(def: GameDef<G, V, S>, describe?: (state: G['state']) => string[]): ReplayEngine<G> => ({
  game: def.rules,
  content: () => def.content,
  ...(def.format === undefined ? {} : { format: def.format }),
  ...(describe === undefined ? {} : { describe }),
});
