import { useState, type ReactNode } from 'react';
import { defaultSetup, defaultWords, validateSetup, type Field, type Option, type Setup, type SetupSpec, type Words } from './model.ts';

export type MenuEntry = { id: string; label: ReactNode; disabled?: boolean };

export function MainMenu({ entries, onSelect, className, bare }: { entries: MenuEntry[]; onSelect: (id: string) => void; className?: string; bare?: boolean }) {
  const items = entries.map((e) => (
    <button key={e.id} type="button" className={bare ? className : undefined} data-entry={e.id} disabled={e.disabled} onClick={() => !e.disabled && onSelect(e.id)}>{e.label}</button>
  ));
  return bare ? <>{items}</> : <nav className={className} data-part="menu">{items}</nav>;
}

export function SetupForm({ spec, onStart, words, initial, value, onChange, renderField, className, id, submit = true }: { spec: SetupSpec; onStart: (setup: Setup) => void; words?: Partial<Words>; initial?: Setup; value?: Setup; onChange?: (setup: Setup) => void; renderField?: (field: Field, value: unknown, set: (v: unknown) => void) => ReactNode; className?: string; id?: string; submit?: boolean }) {
  const w = { ...defaultWords, ...words };
  const [own, setOwn] = useState<Setup>(() => initial ?? defaultSetup(spec));
  const s = value ?? own;
  const setS = (n: Setup) => { if (!value) setOwn(n); onChange?.(n); };
  const errors = validateSetup(spec, s);
  const pick = (label: string, key: string, options: Option[]) => renderField?.({ key, label, options }, s[key], (v) => setS({ ...s, [key]: v })) ?? (
    <label data-field={key}>{label}
      <select value={(s[key] as string | undefined) ?? ''} onChange={(e) => setS({ ...s, [key]: e.target.value })}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  const sp = spec.seats;
  const setCount = (v: number) => {
    if (!sp) return;
    const n = Math.min(sp.max, Math.max(sp.min, Math.round(v) || sp.min));
    const seats = s.seats.slice(0, n);
    while (seats.length < n) seats.push({ kind: sp.kinds[0]?.value ?? '' });
    setS({ ...s, seats });
  };
  const setSeat = (i: number, p: Partial<Setup['seats'][number]>) => setS({ ...s, seats: s.seats.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const many = (e: NonNullable<SetupSpec['many']>[number]) => {
    const min = e.min ?? 0, max = e.max ?? e.options.length;
    const cur = (s[e.key] as string[] | undefined) ?? [];
    const set = (v: unknown) => setS({ ...s, [e.key]: v });
    return renderField?.({ key: e.key, label: e.label, options: e.options, many: { min, max } }, cur, set) ?? (
      <fieldset data-field={e.key}>
        <legend>{e.label}</legend>
        {e.options.map((o) => {
          const on = cur.includes(o.value);
          return (
            <label key={o.value}>
              <input type="checkbox" checked={on} disabled={on ? cur.length <= min : cur.length >= max} onChange={() => set(on ? cur.filter((x) => x !== o.value) : e.options.map((x) => x.value).filter((x) => x === o.value || cur.includes(x)))} />
              {o.label}
            </label>
          );
        })}
      </fieldset>
    );
  };
  return (
    <form id={id} className={className} data-part="setup" onSubmit={(e) => { e.preventDefault(); if (!errors.length) onStart({ ...s, seats: s.seats.map(({ name, ...x }) => (name ? { ...x, name } : x)) }); }}>
      {sp && <label data-field="seat-count">{w.seats}
        <input type="number" min={sp.min} max={sp.max} value={s.seats.length} onChange={(e) => setCount(Number(e.target.value))} />
      </label>}
      {sp && s.seats.map((seat, i) => (
        <fieldset key={i} data-seat={i}>
          <legend>{w.seat} {i + 1}</legend>
          <select aria-label={`${w.seat} ${i + 1}`} value={seat.kind} onChange={(e) => setSeat(i, { kind: e.target.value })}>
            {sp.kinds.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {sp.names && <input aria-label={`${w.name} ${i + 1}`} value={seat.name ?? ''} onChange={(e) => setSeat(i, { name: e.target.value })} />}
        </fieldset>
      ))}
      {spec.scenarios && pick(w.scenario, 'scenario', spec.scenarios)}
      {spec.difficulties && pick(w.difficulty, 'difficulty', spec.difficulties)}
      {spec.extra?.map((e) => <span key={e.key}>{pick(e.label, e.key, e.options)}</span>)}
      {spec.many?.map((e) => <span key={e.key}>{many(e)}</span>)}
      {errors.length > 0 && <p role="alert">{w.invalid}</p>}
      {submit && <button type="submit" disabled={errors.length > 0}>{w.start}</button>}
    </form>
  );
}
