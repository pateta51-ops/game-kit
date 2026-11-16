import { AppFrame, type RouteDef } from '../../kit/app-frame/ui.ts';
import { May, PickAmount, PickOptions, PromptHost, type Widgets } from '../../kit/prompt-host/ui.ts';
import { SavesScreen } from '../../kit/saves/ui.ts';
import { SettingsScreen } from '../../kit/settings/ui.ts';
import { gameResult, logLines } from '../../kit/table-panels/index.ts';
import { GameOver, LogPanel } from '../../kit/table-panels/ui.tsx';
import { cardText, CONTENT, WORDS, type RefPrompt, type RefView } from '../engine/api.ts';
import { game, mySeat, saves, SCHEMA, useGame, useSettings } from './store.ts';

type Name = 'menu' | 'play' | 'settings' | 'saves';
const WIDGETS: Widgets<RefPrompt, RefView> = { pick: PickOptions, amount: PickAmount, may: May };
const TITLES = { pick: 'Play a card', amount: 'How much is the wild card worth?', may: 'Draw a card?' };
const card = (id: string | undefined): string => {
  const v = CONTENT.cards[id ?? ''] ?? 0;
  return v === 0 ? 'Wild' : String(v);
};

function Play() {
  const snap = useGame();
  useSettings((x) => x.values.seat);
  const { state, view } = snap;
  const seat = mySeat();
  const result = state.result;
  return (
    <main>
      <p>Scores: {state.scores[0]} - {state.scores[1]}. Deck: {view.zones['deck']?.count}. Your hand: {view.hand.map(card).join(', ')}. Their hand: {view.zones[`hand:${seat === '0' ? '1' : '0'}`]?.count} cards.</p>
      {result !== null ? (
        <div data-testid="result">
          <GameOver result={gameResult(state.scores)} seatName={(s) => (s === seat ? 'You' : 'Them')} onRematch={() => game.fresh(String(Date.now()))} />
        </div>
      ) : (
        <PromptHost
          widgets={WIDGETS}
          prompt={state.prompt}
          view={view}
          seat={seat}
          answer={(picks, id) => void (id !== undefined && game.answer(picks, id))}
          title={(p) => TITLES[p.kind]}
          look={{ label: (o, p) => (p.kind === 'pick' ? `${card(o.id)}: ${cardText(CONTENT.cards[o.id] ?? 0)}` : o.id === 'yes' ? 'Draw' : o.id === 'no' ? 'No' : o.id) }}
        />
      )}
      <button type="button" data-testid="undo" disabled={!game.canUndo().ok} onClick={() => game.undo()}>Undo</button>
      <LogPanel lines={logLines(state.log, WORDS)} />
      <a href="#/">Menu</a>
    </main>
  );
}

function Menu() {
  return (
    <nav>
      <button type="button" onClick={() => game.fresh(String(Date.now()))}>New game</button> <a href="#/play">Play</a> <a href="#/settings">Settings</a> <a href="#/saves">Saves</a>
    </nav>
  );
}

function Saves() {
  useGame();
  return <SavesScreen saves={saves} history={game.saved()} summary={(s) => `Scores ${String(s.scores[0])} - ${String(s.scores[1])}`} onLoad={(save) => game.load(save) ?? undefined} />;
}

const ROUTES: Record<Name, RouteDef<Name>> = {
  menu: { screen: Menu, title: '{{name}}' },
  play: { screen: Play },
  settings: { screen: () => <SettingsScreen schema={SCHEMA} store={useSettings} /> },
  saves: { screen: Saves },
};

export function App() {
  return <AppFrame routes={ROUTES} home="menu" />;
}
