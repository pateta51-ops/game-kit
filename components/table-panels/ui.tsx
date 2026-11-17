import { useEffect, useRef, useState, type ReactNode } from 'react';
import { banner, filterSeat, groupByTurn, phaseChanged, type Banner, type GameResult, type LogLine, type OpponentTurn, type Phase, type StepLine } from './panels.ts';

// Unstyled: structure and data-* hooks only; the game owns layout and look.
export function LogPanel({ lines, seats, seatName = (s) => s, turnName = (t) => `Turn ${t}`, renderLine }: {
  lines: readonly LogLine[]; seats?: readonly string[]; seatName?: (s: string) => string; turnName?: (t: number) => ReactNode; renderLine?: (l: LogLine) => ReactNode;
}) {
  const [seat, setSeat] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const shown = filterSeat(lines, seat);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [shown.length]);
  return (
    <section data-part="log">
      {seats ? (
        <div data-part="log-filter">
          {[null, ...seats].map((s) => <button data-kit key={s ?? 'all'} type="button" data-seat={s ?? ''} aria-pressed={seat === s} onClick={() => setSeat(s)}>{s === null ? 'All' : seatName(s)}</button>)}
        </div>
      ) : null}
      <div data-part="log-lines" ref={box}>
        {groupByTurn(shown).map((g) => (
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

export function GameOver({ result, seatName = (s) => s, breakdown, onRematch, onReview, onHome, labels = {} }: {
  result: GameResult; seatName?: (s: string) => ReactNode; breakdown?: (seat: string) => ReactNode;
  onRematch?: () => void; onReview?: () => void; onHome?: () => void; labels?: { tie?: string; winner?: string; rematch?: string; review?: string; home?: string };
}) {
  return (
    <section data-part="game-over" data-tied={result.tied}>
      <h2>{result.tied ? (labels.tie ?? 'Tie') : <>{labels.winner ?? 'Winner'}: {seatName(result.winners[0] ?? '')}</>}</h2>
      <ol>{result.standings.map((s) => <li key={s.seat} data-seat={s.seat} data-rank={s.rank}><span>{seatName(s.seat)}</span> <b>{s.score}</b>{breakdown ? <div data-part="breakdown">{breakdown(s.seat)}</div> : null}</li>)}</ol>
      <div data-part="game-over-actions">
        {onRematch ? <button data-kit type="button" data-action="rematch" onClick={onRematch}>{labels.rematch ?? 'Rematch'}</button> : null}
        {onReview ? <button data-kit type="button" data-action="review" onClick={onReview}>{labels.review ?? 'Review log'}</button> : null}
        {onHome ? <button data-kit type="button" data-action="home" onClick={onHome}>{labels.home ?? 'Home'}</button> : null}
      </div>
    </section>
  );
}

// fires onPhase(banner) when the phase, turn or seat changes, not on first show
export function TurnBanner({ phases, turn, seat, phase, seatName = (s) => s, turnName, onPhase, children }: {
  phases: readonly Phase[]; turn: number; seat: string; phase: string; seatName?: (s: string) => ReactNode; turnName?: (t: number) => ReactNode; onPhase?: (b: Banner) => void; children?: ReactNode;
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
      <span data-part="turn">{turnName ? turnName(turn) : <>Turn {turn}</>}</span> <span data-part="seat">{seatName(seat)}</span> <span data-part="phase" data-index={b.index}>{b.phase}</span>{children}
    </header>
  );
}
