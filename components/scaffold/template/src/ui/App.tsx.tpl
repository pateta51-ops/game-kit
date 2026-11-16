import { game, useGame } from './store.ts';

export function App() {
  const { state } = useGame();
  return (
    <main>
      <h1>{{name}}</h1>
      <p>{state.result ? 'Won' : `Steps: ${state.count}`}</p>
      {state.prompt && <button onClick={() => game.answer(['step'], state.prompt?.id ?? 0)}>Step</button>}
      <button onClick={() => game.undo()}>Undo</button>
    </main>
  );
}
