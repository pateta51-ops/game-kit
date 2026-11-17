import { navigate, routeHref } from '../../kit/app-frame/index.ts';
import { AppFrame, type RouteDef } from '../../kit/app-frame/ui.ts';
import { SavesScreen } from '../../kit/saves/ui.ts';
import { MainMenu, SetupForm } from '../../kit/screens/ui.ts';
import { SettingsScreen } from '../../kit/settings/ui.ts';
import { game, INITIAL, isRunning, saves, SCHEMA, SPEC, startGame, useGame, useSettings } from './store.ts';

type Name = 'menu' | 'setup' | 'play' | 'settings' | 'saves';
const go = (n: Name): void => navigate(routeHref(n, 'menu'));

function Play() {
  const { state } = useGame();
  return (
    <main>
      <p>{state.result ? 'Won' : `Steps: ${state.count}`}</p>
      {state.prompt && <button type="button" data-testid="step" onClick={() => game.answer(['step'], state.prompt?.id ?? 0)}>Step</button>}
      <button type="button" data-testid="undo" disabled={!game.canUndo().ok} onClick={() => game.undo()}>Undo</button>
      <a href="#/">Menu</a>
    </main>
  );
}

function Menu() {
  const entries = [{ id: 'setup', label: 'New game' }, { id: 'play', label: 'Continue', disabled: !isRunning() }, { id: 'settings', label: 'Settings' }, { id: 'saves', label: 'Saves' }];
  return <MainMenu entries={entries} onSelect={(id) => go(id as Name)} />;
}

function Saves() {
  useGame();
  return <SavesScreen saves={saves} history={game.saved()} summary={(s) => `Steps ${String(s.count)}`} onLoad={(save) => game.load(save) ?? undefined} />;
}

const ROUTES: Record<Name, RouteDef<Name>> = {
  menu: { screen: Menu, title: '{{name}}' },
  setup: { screen: () => <SetupForm spec={SPEC} initial={INITIAL} onStart={(x) => { startGame(x); go('play'); }} /> },
  play: { screen: Play },
  settings: { screen: () => <SettingsScreen schema={SCHEMA} store={useSettings} /> },
  saves: { screen: Saves },
};

export function App() {
  return <AppFrame routes={ROUTES} home="menu" />;
}
