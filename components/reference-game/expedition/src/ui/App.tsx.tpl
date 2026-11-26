import { useMemo, useState, useSyncExternalStore } from 'react';
import { createGameStore } from '../../kit/game-store/index.ts';
import { createExpedition, EXPEDITIONS, type ExpeditionConfig } from '../engine/api.ts';

const label = (id: string): string => id === 'attack:guard' ? 'Attack guard'
  : id.startsWith('move:') ? `Move to ${id.slice(5)}` : 'Explore the frontier';

function Play({ config, seed }: { config: ExpeditionConfig; seed: string }) {
  const store = useMemo(() => createGameStore(createExpedition(config).def, { seat: 'explorer', seed, instant: () => true }), [config, seed]);
  const snap = useSyncExternalStore(store.subscribe, store.get);
  const view = snap.view;
  return <section aria-label="Expedition board">
    <h2>{config.id === 'short-passage' ? 'Short passage' : 'Long gallery'}</h2>
    <p aria-live="polite" data-testid="expedition-status">{view.result === 'escaped' ? 'You reached the exit.' : view.result === 'exhausted' ? 'You ran out of action points.' : `${String(view.points)} action points remain.`}</p>
    <p>Guard: {view.guard.defeated ? 'defeated' : `${String(view.guard.health)} health, ${String(config.armor)} armor`}. Attack power: {config.power}. Unexplored tiles: {view.remainingTiles}.</p>
    <ol aria-label="Revealed spaces">{view.board.order.map(id => <li key={id}>
      {id}{id === view.position ? ' — you are here' : ''}{id === view.guard.space && !view.guard.defeated ? ' — guard' : ''}{id === view.goal ? ' — exit' : ''}
    </li>)}</ol>
    {view.prompt && <div aria-label="Your action">{view.prompt.options.map(option => <button type="button" key={option.id} disabled={!option.enabled}
      onClick={() => store.answer([option.id], view.prompt!.id)}>{label(option.id)}</button>)}</div>}
    {snap.error && <p role="alert">{snap.error}</p>}
    <p><button type="button" onClick={() => store.fresh(seed)}>Restart this expedition</button></p>
  </section>;
}

export function App() {
  const [index, setIndex] = useState(0);
  const [seed, setSeed] = useState('expedition-a');
  const [draftSeed, setDraftSeed] = useState(seed);
  return <main>
    <h1>Expedition</h1>
    <p>Defeat the guard, reveal the route and reach the exit. Every move, attack or exploration costs one action point. Entering the exit on your last point wins.</p>
    <label>Route <select value={index} onChange={event => setIndex(Number(event.target.value))}>
      <option value={0}>Short passage</option><option value={1}>Long gallery</option>
    </select></label>{' '}
    <form onSubmit={event => { event.preventDefault(); if (draftSeed.trim()) setSeed(draftSeed.trim()); }}>
      <label>Seed <input value={draftSeed} onChange={event => setDraftSeed(event.target.value)} required /></label>{' '}
      <button type="submit">Start with this seed</button>
    </form>
    <Play config={EXPEDITIONS[index]!} seed={seed} />
  </main>;
}
