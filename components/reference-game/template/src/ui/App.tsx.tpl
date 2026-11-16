import { AppFrame, type RouteDef } from '../../kit/app-frame/ui';
import { autoAnswer } from '../../kit/prompt-host/index';
import { May, PickAmount, PickOptions, PromptHost, type Widgets } from '../../kit/prompt-host/ui';
import { SavesScreen } from '../../kit/saves/ui';
import { SettingsScreen } from '../../kit/settings/ui';
import { cardText, viewOf, type RefPrompt, type RefView } from '../engine/api';
import { saves, SCHEMA, useGame, useSettings } from './store';

type Name = 'menu' | 'play' | 'settings' | 'saves';
const WIDGETS: Widgets<RefPrompt, RefView> = { pick: PickOptions, amount: PickAmount, may: May };
const TITLES = { pick: 'Play a card', amount: 'How much is the wild card worth?', may: 'Draw a card?' };
const card = (n: number | undefined): string => (n === 0 ? 'Wild' : String(n));

function Play() {
  const { state, answer } = useGame();
  const seat = useSettings((x) => x.values.seat);
  const obvious = useSettings((x) => x.values.obvious);
  const view = viewOf(state, seat);
  const result = state.result;
  return (
    <main>
      <p>Scores: {state.scores.join(' - ')}. Deck: {view.deck}. Your hand: {view.hand.map(card).join(', ')}. Their hand: {view.otherHand} cards.</p>
      {result !== null ? (
        <p data-testid="result">{result.winner === null ? 'A draw.' : result.winner === seat ? 'You win.' : 'You lose.'}</p>
      ) : (
        <PromptHost
          widgets={WIDGETS}
          prompt={state.prompt}
          view={view}
          mine={state.prompt?.seat === seat}
          answer={answer}
          auto={(p) => autoAnswer(p, obvious)}
          title={(p) => TITLES[p.kind]}
          look={{ label: (o, p) => (p.kind === 'pick' ? `${card(view.hand[Number(o.id.slice(1))])}: ${cardText(view.hand[Number(o.id.slice(1))] ?? 0)}` : o.id === 'yes' ? 'Draw' : o.id === 'no' ? 'No' : o.id) }}
        />
      )}
      <a href="#/">Menu</a>
    </main>
  );
}

function Menu() {
  const fresh = useGame((g) => g.fresh);
  return (
    <nav>
      <button type="button" onClick={() => fresh(String(Date.now()))}>New game</button> <a href="#/play">Play</a> <a href="#/settings">Settings</a> <a href="#/saves">Saves</a>
    </nav>
  );
}

function Saves() {
  const { history, load } = useGame();
  return <SavesScreen saves={saves} history={history} summary={(s) => `Scores ${s.scores.join(' - ')}`} onLoad={(save) => load(save)} />;
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
