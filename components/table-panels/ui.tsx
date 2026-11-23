import { useEffect, useRef, useState, type ReactNode } from 'react';
import { banner, filterSeat, groupByTurn, wholeLinesHeight, wholeEntriesHeight, phaseChanged, type Banner, type GameResult, type LogLine, type OpponentTurn, type Phase, type StepLine } from './panels.ts';

// Unstyled: structure and data-* hooks only; the game owns layout and look.
export function LogPanel({ lines, seats, seatName = (s) => s, turnName = (t) => `Turn ${t}`, renderLine, order = 'oldest-first', wholeLines }: {
  order?: 'newest-first' | 'oldest-first'; wholeLines?: boolean | number; lines: readonly LogLine[]; seats?: readonly string[]; seatName?: (s: string) => string; turnName?: (t: number) => ReactNode; renderLine?: (l: LogLine) => ReactNode;
}) {
  const [seat, setSeat] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const shown = filterSeat(lines, seat);
  const newest = order === 'newest-first';
  const [fit, setFit] = useState<number | null>(null);
  const toNewest = () => { if (box.current) box.current.scrollTop = newest ? 0 : box.current.scrollHeight; };
  useEffect(() => {
    const el = box.current;
    if (!wholeLines || !el) { setFit(null); return; }
    const measure = () => {
      el.style.height = '';
      const r = el.getBoundingClientRect();
      const h = typeof wholeLines === 'number' ? (wholeLines > 0 ? wholeLinesHeight(el.clientHeight, wholeLines) : null) : wholeEntriesHeight(el.clientHeight, [...el.querySelectorAll('h4, li')].map((x) => { const b = x.getBoundingClientRect(); return { top: b.top - r.top + el.scrollTop, bottom: b.bottom - r.top + el.scrollTop }; }), !newest, el.scrollHeight);
      el.style.height = h === null ? '' : `${h}px`;
      setFit(h);
      toNewest();
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [wholeLines, shown.length, newest]);
  useEffect(toNewest, [shown.length, newest, fit]);
  return (
    <section data-part="log">
      {seats ? (
        <div data-part="log-filter">
          {[null, ...seats].map((s) => <button data-kit key={s ?? 'all'} type="button" data-seat={s ?? ''} aria-pressed={seat === s} onClick={() => setSeat(s)}>{s === null ? 'All' : seatName(s)}</button>)}
        </div>
      ) : null}
      <div data-part="log-lines" ref={box} data-order={order} data-fit={fit ?? undefined}>
        {(newest ? groupByTurn(shown).reverse().map((g) => ({ ...g, lines: [...g.lines].reverse() })) : groupByTurn(shown)).map((g) => (
          <div key={g.turn} data-part="log-turn" data-turn={g.turn}>
            <h4>{turnName(g.turn)}</h4>
            <ul>{g.lines.map((l) => <li key={l.id} data-seat={l.seat ?? ''}>{renderLine ? renderLine(l) : l.text}</li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OpponentTurnPanel({ turn, onSkip, hidden = 'Something you cannot see', renderStep, title }: {
  turn: OpponentTurn; onSkip: () => void; hidden?: ReactNode; renderStep?: (s: StepLine) => ReactNode; title?: ReactNode;
}) {
  const row = (s: StepLine, state: string) => <li key={s.index} data-state={state} data-hidden={s.hidden}>{s.hidden ? hidden : renderStep ? renderStep(s) : s.text}</li>;
  return (
    <section data-part="opponent-turn" data-active={turn.current !== null}>
      {title ? <h4>{title}</h4> : null}
      <ol>{turn.done.map((s) => row(s, 'done'))}{turn.current ? row(turn.current, 'current') : null}</ol>
      {turn.current ? <button data-kit type="button" data-action="skip" onClick={onSkip}>Skip to end ({turn.left + 1})</button> : null}
    </section>
  );
}

type OverActions = { onRematch?: (() => void) | undefined; onReview?: (() => void) | undefined; onHome?: (() => void) | undefined; labels?: { tie?: string; winner?: string; rematch?: string; review?: string; home?: string } };

export function GameOverActions({ onRematch, onReview, onHome, labels = {} }: OverActions) {
  return (
    <div data-part="game-over-actions">
      {onRematch ? <button data-kit type="button" data-action="rematch" onClick={onRematch}>{labels.rematch ?? 'Rematch'}</button> : null}
      {onReview ? <button data-kit type="button" data-action="review" onClick={onReview}>{labels.review ?? 'Review log'}</button> : null}
      {onHome ? <button data-kit type="button" data-action="home" onClick={onHome}>{labels.home ?? 'Home'}</button> : null}
    </div>
  );
}

// title replaces the default title; reason shows under it; standings={false} (or none) hides the list; actions={false} leaves the buttons to a <GameOverActions/> placed elsewhere
export function GameOver({ result, seatName = (s) => s, breakdown, onRematch, onReview, onHome, labels = {}, title, reason, standings = true, actions = true }: {
  result: Omit<GameResult, 'standings'> & { standings: readonly { seat: string; rank: number; score?: number }[] }; seatName?: (s: string) => ReactNode; breakdown?: (seat: string) => ReactNode;
  title?: ReactNode; reason?: ReactNode; standings?: boolean; actions?: boolean;
} & OverActions) {
  return (
    <section data-part="game-over" data-tied={result.tied}>
      <h2>{title ?? (result.tied ? (labels.tie ?? 'Tie') : <>{labels.winner ?? 'Winner'}: {seatName(result.winners[0] ?? '')}</>)}</h2>
      {reason != null ? <p data-part="game-over-reason">{reason}</p> : null}
      {standings && result.standings.length ? <ol>{result.standings.map((s) => <li key={s.seat} data-seat={s.seat} data-rank={s.rank}><span>{seatName(s.seat)}</span> {s.score != null ? <b>{s.score}</b> : null}{breakdown ? <div data-part="breakdown">{breakdown(s.seat)}</div> : null}</li>)}</ol> : null}
      {actions ? <GameOverActions onRematch={onRematch} onReview={onReview} onHome={onHome} labels={labels} /> : null}
    </section>
  );
}

// fires onPhase(banner) when the phase, turn or seat changes, not on first show
export function TurnBanner({ phases, turn, seat, phase, seatName = (s) => s, turnName, phaseName, onPhase, children }: {
  phases: readonly Phase[]; turn: number; seat: string; phase: string; seatName?: (s: string) => ReactNode; turnName?: (t: number) => ReactNode; phaseName?: (b: Banner) => ReactNode; onPhase?: (b: Banner) => void; children?: ReactNode;
}) {
  const b = banner(phases, turn, seat, phase);
  const prev = useRef<Banner | null>(null);
  const cb = useRef(onPhase);
  useEffect(() => { cb.current = onPhase; });
  useEffect(() => {
    if (phaseChanged(prev.current, b)) cb.current?.(b);
    prev.current = b;
  }, [b.turn, b.seat, b.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <header data-part="turn-banner" data-phase={phase} data-seat={seat}>
      <span data-part="turn">{turnName ? turnName(turn) : <>Turn {turn}</>}</span> <span data-part="seat">{seatName(seat)}</span> {(phaseName ? phaseName(b) : b.phase) != null && <span data-part="phase" data-index={b.index}>{phaseName ? phaseName(b) : b.phase}</span>}{children}
    </header>
  );
}
