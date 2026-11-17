// K218 demo, not shipped: ?n=7&mode=face|back|picked. Plain coloured rectangles as faces. Built and shot by shots.mjs.
import { createRoot } from 'react-dom/client';
import type { BoardPick } from '../../prompt-host/ui.ts';
import { CardHand } from '../ui.tsx';

const q = new URLSearchParams(location.search);
const n = Number(q.get('n') ?? 7);
const mode = q.get('mode') ?? 'face';
const ids = Array.from({ length: n }, (_, i) => `c${String(i)}`);
const pick = { marks: Object.fromEntries(ids.map((id) => [id, 'legal'])), picks: mode === 'picked' ? ['c4'] : [], armed: null, ready: false, tap: () => undefined, tapMany: () => undefined, confirm: () => undefined, cancel: () => undefined } as unknown as BoardPick;
const style = `
body{margin:0;background:#1d2630;font:16px sans-serif}
.stage{position:absolute;left:360px;width:1200px;top:380px}
.stage [data-part=hand]{--hand-card-w:10rem;--hand-step-max:5rem}
.stage [data-part=face]>div{width:100%;height:100%;border:2px solid #fff;border-radius:8px;box-sizing:border-box;color:#fff;font-size:2rem;padding:.5rem;box-shadow:0 .3rem .8rem rgb(0 0 0/.6)}
.stage [data-part=hint]{background:#000;color:#fff;padding:2px 8px;border-radius:6px}
[data-part=card][data-mark=legal] [data-part=face]>div{outline:3px solid gold}
[data-part=card][data-picked=picked] [data-part=face]>div{outline:3px solid lime}
`;
createRoot(document.getElementById('root')!).render(
  <>
    <style>{style}</style>
    <div className="stage">
      <CardHand view={mode === 'back' ? { cards: ids.map(() => null) } : { cards: ids }} pick={pick} speed={1} label="Hand" cardLabel={(id) => id} hint={() => 'Play'}
        face={(id) => <div style={{ background: `hsl(${String(Number(id.slice(1)) * 37)} 60% 40%)` }}>{id.slice(1)}</div>}
        back={() => <div style={{ width: '100%', height: '100%', background: '#345', border: '2px solid #fff', borderRadius: 8, boxSizing: 'border-box' }} />} />
    </div>
  </>,
);
