import { navigate, routeHref } from '../../kit/app-frame/index.ts';
import { AppFrame, type RouteDef } from '../../kit/app-frame/ui.ts';
import { describeEffect, type VerbTask } from '../../kit/card-language/index.ts';
import { May, PickOptions, PromptHost, type Widgets } from '../../kit/prompt-host/ui.ts';
import { SavesScreen } from '../../kit/saves/ui.ts';
import { MainMenu, SetupForm } from '../../kit/screens/ui.ts';
import { SettingsScreen } from '../../kit/settings/ui.ts';
import { gameResult, logLines } from '../../kit/table-panels/index.ts';
import { GameOver, LogPanel } from '../../kit/table-panels/ui.tsx';
import { cardText, CONTENT, defOf, VERBS, WORDS, type RefPrompt, type RefStep, type RefView } from '../engine/api.ts';
import { campaignNow, game, INITIAL, mySeat, nextScenario, saves, SCHEMA, SPEC, startCampaign, startGame, useGame, useSettings } from './store.ts';

type Name = 'menu' | 'setup' | 'play' | 'settings' | 'saves';
const go = (n: Name): void => navigate(routeHref(n, 'menu'));
const WIDGETS: Widgets<RefPrompt, RefView> = { pick: PickOptions, may: May };
const name = (id: string): string => defOf(id)?.name ?? id;

function Play() {
  const snap = useGame();
  const { state, view } = snap;
  const seat = mySeat();
  const result = state.result;
  const top = state.stack.at(-1) as VerbTask<RefStep> | undefined;
  return (
    <main>
      <p>Scenario {state.options.scenario}. Life: {state.life[0]} - {state.life[1]}. Round {state.flow?.round}, {state.flow?.phase}. Deck: {view.zones['deck']?.count}. Automa mode: {state.mode ?? 'none'}.</p>
      <p>Your hand: {view.hand.map(name).join(', ')}. Their hand: {view.zones[`hand:${seat === '0' ? '1' : '0'}`]?.count} cards. In play: {['play:0', 'play:1'].map((z) => (view.zones[z]?.cards ?? []).map((c) => name(c ?? '')).join(', ')).join(' / ')}.</p>
      {result !== null ? (
        <div data-testid="result">
          <GameOver result={gameResult(state.life)} seatName={(s) => (s === seat ? 'You' : 'Them')} onRematch={() => game.fresh(String(Date.now()))} />
          {campaignNow()?.status === 'active' && <button type="button" data-testid="next" onClick={() => nextScenario()}>Next scenario</button>}
        </div>
      ) : (
        <PromptHost
          widgets={WIDGETS}
          prompt={state.prompt}
          view={view}
          seat={seat}
          answer={(picks, id) => void (id !== undefined && game.answer(picks, id))}
          title={(p) => (p.kind === 'pick' ? 'Play a card' : top?.kind === 'verb' ? describeEffect(VERBS, [top.step]) : '')}
          look={{ label: (o, p) => (p.kind === 'pick' ? `${name(o.id)}: ${cardText(CONTENT.cards[o.id] ?? '')}` : o.id === 'yes' ? 'Yes' : o.id === 'no' ? 'No' : o.id) }}
        />
      )}
      <button type="button" data-testid="undo" disabled={!game.canUndo().ok} onClick={() => game.undo()}>Undo</button>
      <LogPanel lines={logLines(state.log, WORDS)} />
      <a href="#/">Menu</a>
    </main>
  );
}

function Menu() {
  const entries = [{ id: 'setup', label: 'New game' }, { id: 'campaign', label: 'Campaign' }, { id: 'play', label: 'Continue' }, { id: 'settings', label: 'Settings' }, { id: 'saves', label: 'Saves' }];
  return (
    <MainMenu
      entries={entries}
      onSelect={(id) => {
        if (id === 'campaign') startCampaign();
        go(id === 'campaign' ? 'play' : (id as Name));
      }}
    />
  );
}

function Saves() {
  useGame();
  return <SavesScreen saves={saves} history={game.saved()} summary={(s) => `Life ${String(s.life[0])} - ${String(s.life[1])}`} onLoad={(save) => game.load(save) ?? undefined} />;
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
