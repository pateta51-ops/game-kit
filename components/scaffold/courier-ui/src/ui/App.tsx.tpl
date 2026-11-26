import { navigate, routeHref } from '../../kit/app-frame/index.ts';
import { AppFrame, type RouteDef } from '../../kit/app-frame/ui.ts';
import { SavesScreen } from '../../kit/saves/ui.ts';
import '../../kit/saves/saves.css';
import { MainMenu, SetupForm } from '../../kit/screens/ui.ts';
import { SettingsScreen } from '../../kit/settings/ui.ts';
import { CONFIG } from '../engine/api.ts';
import { game, INITIAL, isRunning, loadGame, saves, SCHEMA, SPEC, startGame, useGame, useSettings } from './store.ts';
import { ids, instructions, plainView, title } from './text.ts';
import './theme/tokens.css';
import './theme/courier.css';

type Name = 'menu' | 'setup' | 'play' | 'settings' | 'saves';
const go = (name: Name): void => navigate(routeHref(name, 'menu'));
const cells = Array.from({ length: CONFIG.board.rows }, (_, row) => Array.from({ length: CONFIG.board.cols }, (_, col) => `r${String(row)}c${String(col)}`)).flat();

function Play() {
  const snap = useGame();
  const view = plainView(snap.view, ids.strip);
  const error = snap.error === null ? '' : ids.strip(snap.error);
  const settings = useSettings();
  return (
    <main>
      {title && <h1>{title}</h1>}
      {settings.values.hints && <p>{ids.strip(instructions)}</p>}
      <p data-testid="position">Position: {view.space}</p>
      <p data-testid="allowance">Moves left: {view.movesLeft}</p>
      <p data-testid="parcel">{view.parcel ? 'Parcel collected' : 'Parcel waiting'}</p>
      {view.result && <h2 data-testid="result">{view.result === 'delivered' ? 'Delivered' : 'Out of moves'}</h2>}
      <div aria-label="Board" role="region" tabIndex={0} className="courier-board" data-testid="courier-board">
        <div data-courier-grid style={{ gridTemplateColumns: `repeat(${String(CONFIG.board.cols)}, minmax(5rem, 1fr))`, minWidth: `${String(CONFIG.board.cols * 5.5 - 0.5)}rem` }}>
          {cells.map(space => {
            const option = view.prompt?.options.find(item => item.id === space);
            return <button key={space} type="button" aria-label={`Move to ${space}`} data-testid={`move-${space}`} disabled={!option?.enabled}
              onClick={() => { if (option) game.answer([option.id], view.prompt?.id ?? -1); }}>
              {space}{space === view.space ? ' · Courier' : ''}{space === CONFIG.pickup && !view.parcel ? ' · Parcel' : ''}{space === CONFIG.destination ? ' · Delivery' : ''}
            </button>;
          })}
        </div>
      </div>
      <button type="button" data-testid="undo" disabled={!game.canUndo().ok} onClick={() => game.undo()}>Undo</button>
      {error && <p role="alert">{error}</p>}
      <a href="#/">Menu</a>
    </main>
  );
}

function Menu() {
  return <MainMenu entries={[{ id: 'setup', label: 'New game' }, { id: 'play', label: 'Continue', disabled: !isRunning() }, { id: 'settings', label: 'Settings' }, { id: 'saves', label: 'Saves' }]} onSelect={id => go(id as Name)} />;
}

function Saves() {
  useGame();
  return <SavesScreen saves={saves} history={game.saved()} summary={state => `Courier at ${state.space}`} onLoad={save => {
    const error = loadGame(save);
    if (error === undefined) go('play');
    return error === undefined ? undefined : ids.strip(error) || 'Unable to load this game.';
  }} />;
}

const ROUTES: Record<Name, RouteDef<Name>> = {
  menu: { screen: Menu, title },
  setup: { screen: () => <SetupForm spec={SPEC} initial={INITIAL} onStart={setup => { startGame(setup); go('play'); }} /> },
  play: { screen: Play },
  settings: { screen: () => <SettingsScreen schema={SCHEMA} store={useSettings} /> },
  saves: { screen: Saves },
};

export function App() {
  return <div className="courier-app" data-courier-root><AppFrame routes={ROUTES} home="menu" /></div>;
}
