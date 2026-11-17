// K263 demo, not shipped: the kit's parts in Imperium's phone screen. States by query: ?s=base|you|open|sheet|menu
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { PhoneArea, PhoneFrame, PhoneMenu, PromptLine, Sheet, SheetActions, TabBar, TopBar } from '../ui.ts';

const q = new URLSearchParams(location.search).get('s') ?? 'base';
const css = `
:root{--pm-sheet-bg:#efe6d2;--pm-sheet-text:#2b2419;--pm-scrim:rgb(18 15 10 / .55);--pm-sheet-radius:16px 16px 0 0}
html,body{margin:0;height:100%;overflow:hidden;background:#efeae2;font:16px Georgia,serif;color:#2b2419}
[data-part=top],[data-part=dock],[data-part=tabs]{background:#efe6d2}
[data-part=top]{border-bottom:3px solid #b9ad94}
[data-part=dock]{border-top:3px solid #b9ad94;box-shadow:0 -3px 10px rgb(0 0 0/.28)}
[data-part=dock-short]{font-weight:700}
[data-part=tabs]{border-top:3px solid #b9ad94}
[data-part=tab]{border:1px solid #9c907a;border-radius:10px;background:rgb(255 255 255/.35);font:800 11.5px sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#2b2419}
[data-part=tab][aria-pressed=true]{background:#d9a441;border-color:#a87b25;color:#1a1406;box-shadow:inset 0 -2px 0 rgb(0 0 0/.18)}
[data-part=dock-kicker]{font:800 10.5px sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#5a4e3b}
.btn{min-height:36px;padding:0 12px;border:1px solid #9c907a;border-radius:9px;background:rgb(255 255 255/.4);font:inherit}
.card{height:150px;border:1px solid #9c907a;border-radius:6px;background:#fff8;display:flex;align-items:end;padding:6px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
[data-part=sheet-action]{border:1px solid #9c907a;border-radius:9px;background:rgb(255 255 255/.4);font:800 11.5px sans-serif;text-transform:uppercase}
[data-part=sheet-action][data-primary=true]{background:#d9a441;border-color:#a87b25;color:#1a1406}
`;

// eslint-disable-next-line react-refresh/only-export-components
function App() {
  const [tab, setTab] = useState(q === 'you' || q === 'sheet' ? 'you' : 'market');
  const [dock, setDock] = useState(q === 'open');
  const [menu, setMenu] = useState(q === 'menu');
  const [sheet, setSheet] = useState(q === 'sheet');
  const tabs = ['market', 'bot', 'you', 'log'].map((id) => ({ id, label: id[0]!.toUpperCase() + id.slice(1), lit: id === 'you' && tab !== 'you', litNote: 'a card to choose here' }));
  return (
    <>
      <style>{css}</style>
      <PhoneFrame
        tab={tab}
        dockOpen={dock}
        top={
          <TopBar
            start={<><span>Grain 3</span><span>Pop 2</span><span>Coin 5</span></>}
            end={<><button type="button" className="btn">Undo</button><button type="button" className="btn" onClick={() => setMenu(true)}>Menu</button><PhoneMenu open={menu} onClose={() => setMenu(false)} label="Game menu"><b>Round 1</b><button type="button" className="btn">Redo</button><button type="button" className="btn">Home</button></PhoneMenu></>}
          />
        }
        dock={
          <PromptLine open={dock} onToggle={() => setDock(!dock)} short="Play a card or end your turn" counts={<><b>1</b><span>A</span><b>2</b><span>E</span></>} kicker="Decision" label="Decision">
            <p>Play a card from your hand, or end your turn.</p>
            <button type="button" className="btn">End turn</button>
          </PromptLine>
        }
        tabs={<TabBar tabs={tabs} active={tab} onTab={setTab} label="Board sections" />}
      >
        {['market', 'bot', 'you', 'log'].map((id) => (
          <PhoneArea key={id} id={id} shown={tab === id}>
            <div className="grid">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" className="card" onClick={() => id === 'you' && setSheet(true)}>{id} card {n}</button>
              ))}
            </div>
          </PhoneArea>
        ))}
      </PhoneFrame>
      {sheet && (
        <Sheet
          title="In your hand"
          onClose={() => setSheet(false)}
          slideMs={q === 'sheet' ? 0 : 240}
          foot={<SheetActions actions={[{ id: 'play', label: 'Play', primary: true, onPress: () => setSheet(false) }, { id: 'cancel', label: 'Cancel', onPress: () => setSheet(false) }]} />}
        >
          <h3>Granary</h3>
          <p>Commons. Gain 2 grain. Then you may pay 1 coin to gain 1 population.</p>
        </Sheet>
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
