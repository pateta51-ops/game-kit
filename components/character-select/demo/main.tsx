import { createRoot } from 'react-dom/client';
import { CharacterSelect } from '../ui.ts';
import { fields, icons, kindOrder, modes, opponents, roster, sets } from './game.ts';
import '../looks/layout.css';
import './theme.css';

const q = new URLSearchParams(location.search);
const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <CharacterSelect
      roster={roster}
      sets={sets}
      opponents={opponents}
      modes={modes}
      fields={fields}
      kindOrder={kindOrder}
      icons={icons}
      phone={q.get('phone') === '1'}
      initial={{ pick: q.get('pick') ?? 'cora', opponent: q.get('opp') ?? 'fen' }}
      words={{ roster: 'Travellers', opponent: 'Choose your rival', deck: (c) => `Look through ${c.short ?? ''}’s deck` }}
      slots={{
        control: (kind, p) =>
          kind === 'begin' ? (
            <button type="button" data-part="begin" data-own="yes" disabled={p.disabled} onClick={p.onClick}>
              ▶ {p.children}
            </button>
          ) : kind === 'deck-tab' ? (
            <button type="button" data-part="tab" data-own="yes" data-kind={p.id} data-on={p.on === true ? 'yes' : 'no'} aria-pressed={p.on} onClick={p.onClick}>
              {p.children}
            </button>
          ) : null,
        header: (
          <div className="demo-title">
            <h1>Pick a Traveller</h1>
            <span>Who walks the river road?</span>
          </div>
        ),
        field: (f, v, set) =>
          f.id !== 'difficulty' ? null : (
            <span className="demo-sub">
              {(f.choices ?? []).map((x) => (
                <button key={x.value} type="button" className={v === x.value ? 'is-on' : ''} disabled={x.disabled != null} onClick={() => { set(x.value); }}>
                  {x.label}
                </button>
              ))}
            </span>
          ),
        sub: () => (
          <div className="demo-sub">
            <button type="button" className="is-on">Day</button>
            <button type="button">Night</button>
          </div>
        ),
        track: (c) => (
          <div className="demo-track">
            <h2>Road track</h2>
            <div>
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ opacity: 0.25 + ((i * (c.stat ?? 1)) % 12) / 16 }} />
              ))}
            </div>
          </div>
        ),
      }}
      renderCard={(card) => (
        <div className="demo-card" data-kind={card.kind}>
          <b>{card.name}</b>
          <small>{card.kind}</small>
        </div>
      )}
      kindLabel={(k) => k[0] + k.slice(1).toLowerCase()}
      renderGlyph={(p) => (p.kind === 'icon' ? <span className="demo-coin" /> : p.name.toLowerCase())}
      onBegin={(c) => {
        console.log(c);
      }}
    />,
  );
