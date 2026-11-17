import { useState } from 'react';
import { defaultSetup, defaultWords, validateSetup, type Option, type Setup, type SetupSpec, type Words } from './model.ts';

export type MenuEntry = { id: string; label: string; disabled?: boolean };

export function MainMenu({ entries, onSelect, className }: { entries: MenuEntry[]; onSelect: (id: string) => void; className?: string }) {
  return (
    <nav className={className} data-part="menu">
      {entries.map((e) => (
        <button key={e.id} type="button" data-entry={e.id} disabled={e.disabled} onClick={() => !e.disabled && onSelect(e.id)}>{e.label}</button>
      ))}
    </nav>
  );
}

export function SetupForm({ spec, onStart, words, initial, className }: { spec: SetupSpec; onStart: (setup: Setup) => void; words?: Partial<Words>; initial?: Setup; className?: string }) {
  const w = { ...defaultWords, ...words };
  const [s, setS] = useState<Setup>(() => initial ?? defaultSetup(spec));
  const errors = validateSetup(spec, s);
  const pick = (label: string, key: string, options: Option[]) => (
    <label data-field={key}>{label}
      <select value={(s[key] as string | undefined) ?? ''} onChange={(e) => setS({ ...s, [key]: e.target.value })}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  const setCount = (v: number) => {
    const n = Math.min(spec.seats.max, Math.max(spec.seats.min, Math.round(v) || spec.seats.min));
    const seats = s.seats.slice(0, n);
    while (seats.length < n) seats.push({ kind: spec.seats.kinds[0]?.value ?? '' });
    setS({ ...s, seats });
  };
  const setSeat = (i: number, p: Partial<Setup['seats'][number]>) => setS({ ...s, seats: s.seats.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <form className={className} data-part="setup" onSubmit={(e) => { e.preventDefault(); if (!errors.length) onStart({ ...s, seats: s.seats.map(({ name, ...x }) => (name ? { ...x, name } : x)) }); }}>
      <label data-field="seat-count">{w.seats}
        <input type="number" min={spec.seats.min} max={spec.seats.max} value={s.seats.length} onChange={(e) => setCount(Number(e.target.value))} />
      </label>
      {s.seats.map((seat, i) => (
        <fieldset key={i} data-seat={i}>
          <legend>{w.seat} {i + 1}</legend>
          <select aria-label={`${w.seat} ${i + 1}`} value={seat.kind} onChange={(e) => setSeat(i, { kind: e.target.value })}>
            {spec.seats.kinds.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {spec.seats.names && <input aria-label={`${w.name} ${i + 1}`} value={seat.name ?? ''} onChange={(e) => setSeat(i, { name: e.target.value })} />}
        </fieldset>
      ))}
      {spec.scenarios && pick(w.scenario, 'scenario', spec.scenarios)}
      {spec.difficulties && pick(w.difficulty, 'difficulty', spec.difficulties)}
      {spec.extra?.map((e) => <span key={e.key}>{pick(e.label, e.key, e.options)}</span>)}
      {errors.length > 0 && <p role="alert">{w.invalid}</p>}
      <button type="submit" disabled={errors.length > 0}>{w.start}</button>
    </form>
  );
}
