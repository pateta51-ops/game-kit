// K246 demo, not shipped: ?mode=rest|seek|play|2d, &t=0..1 for seek. Plain coloured tokens. Built and shot by shots.mjs.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { TokenBag } from '../ui.ts';
import { createBagScene } from '../scene.ts';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'rest';
const kinds = ['red', 'blue', 'green', 'gold'];
const colour: Record<string, string> = { red: '#d33', blue: '#36d', green: '#3a4', gold: '#db3' };
const faceUrl = (k: string): string => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" fill="${colour[k] ?? '#888'}"/><circle cx="64" cy="64" r="40" fill="none" stroke="#fff" stroke-width="8"/><text x="64" y="80" font-size="48" text-anchor="middle" fill="#fff" font-family="sans-serif">${k[0] ?? ''}</text></svg>`)}`;
const contents = Array.from({ length: 8 }, (_, i) => kinds[i % 4] ?? 'red');
const drawn = ['gold', 'red', 'blue'];
const left = (() => { const l = [...contents]; for (const d of drawn) l.splice(l.indexOf(d), 1); return l; })();

(window as unknown as { log: string[] }).log = [];
const log = (s: string): void => { (window as unknown as { log: string[] }).log.push(s); };
window.addEventListener('error', (e) => log(`error ${e.message}`));

document.body.style.cssText = 'margin:0;background:#1d2630;color:#fff;font:16px sans-serif';
const style = document.createElement('style');
style.textContent = '[data-part=token-bag]{position:absolute;left:760px;top:340px;width:400px;height:400px}[data-part=token-bag-count]{position:absolute;left:0;right:0;bottom:-30px;text-align:center;font-size:28px}[data-part=token-bag-count]{color:#fff}';
document.head.append(style);

export function Play() {
  const [draw, setDraw] = useState<{ key: number; left: string[]; drawn: string[] } | null>(null);
  return (
    <>
      <button style={{ position: 'absolute', left: 10, top: 10 }} id="go" onClick={() => setDraw({ key: 1, left, drawn })}>draw</button>
      <TokenBag count={draw === null ? 8 : 5} chosen="3d" speed={1} reduced={() => false} faceUrl={faceUrl} draw={draw} onDrawDone={(k) => { log(`done ${String(k)}`); setDraw(null); }} />
    </>
  );
}

if (mode === 'seek') {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  document.body.append(c);
  const s = createBagScene(c, { contents, drawn, faceUrl, onError: (e) => log(`scene error ${String(e)}`) });
  void s.ready.then(() => { s.seek(Number(q.get('t') ?? 0) * s.duration); document.title = 'ready'; });
} else if (mode === 'rest' || mode === '2d') {
  createRoot(document.getElementById('root')!).render(<TokenBag count={8} chosen="3d" speed={1} faceUrl={faceUrl} draw={null} onDrawDone={() => undefined} />);
  if (mode === 'rest') setTimeout(() => { document.title = 'ready'; }, 1500);
} else {
  createRoot(document.getElementById('root')!).render(<Play />);
}
