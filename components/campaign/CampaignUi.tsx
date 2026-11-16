// Static campaign screens (release 1.0): no motion, no sound. The look is the game's (kit-camp-* classes).
import { useState, type ReactNode } from 'react';
import type { BetweenQuestion, ChangeRow, LogSection, StartQuestion, StartAnswer } from './screens.ts';

export function BetweenScreen({ q, onChoose, words, nextText }: { q: BetweenQuestion; onChoose: (id: string) => void; words?: { cont?: string }; nextText?: string }) {
  return (
    <div className="kit-camp-between" data-testid="between">
      {nextText && <p className="kit-camp-next">{nextText}</p>}
      {q.options.map((o) => <button key={o.id} type="button" data-testid={`between-${o.id}`} onClick={() => onChoose(o.id)}>{o.label ?? words?.cont ?? 'Continue'}</button>)}
    </div>
  );
}

export function HandledList({ items, title }: { items: readonly { id: string; text: string }[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section className="kit-camp-handled" data-testid="handled">
      <h3>{title ?? 'Handled for you'}</h3>
      <ul>{items.map((i) => <li key={i.id}>{i.text}</li>)}</ul>
    </section>
  );
}

export function ChangeList({ rows }: { rows: readonly ChangeRow[] }) {
  return <ul className="kit-camp-changes" data-testid="changes">{rows.map((r, i) => <li key={i}>{r.label}: {r.text}</li>)}</ul>;
}

export function LogSections({ sections, words }: { sections: readonly LogSection[]; words?: { yes?: string; no?: string } }) {
  return (
    <div className="kit-camp-log" data-testid="log-sections">
      {sections.map((s) => (
        <section key={s.id} className="kit-camp-section" data-testid={`log-${s.id}`}>
          <h4>{s.label}{s.cite && <small> {s.cite}</small>}</h4>
          {s.kind === 'key' && <span className={s.crossed ? 'kit-camp-crossed' : ''}>{s.recorded || s.crossed ? words?.yes ?? 'Yes' : words?.no ?? 'No'}</span>}
          {s.kind === 'count' && <span>{s.value}</span>}
          {s.kind === 'set' && <ul>{s.entries?.map((e) => <li key={e}>{e}</li>)}{s.struck?.map((e) => <li key={e} className="kit-camp-crossed"><s>{e}</s></li>)}</ul>}
        </section>
      ))}
    </div>
  );
}

/** The campaign log with tabs: the sections first, then the game's tabs (the changes of a step, `<AchievementList />` from `achievements`, ...). */
export function LogTabs({ sections, tabs = [], title }: { sections: readonly LogSection[]; tabs?: readonly { id: string; label: string; content: ReactNode }[]; title?: string }) {
  const all = [{ id: 'log', label: title ?? 'Log', content: <LogSections sections={sections} /> }, ...tabs];
  const [on, setOn] = useState('log');
  return (
    <div className="kit-camp-tabs" data-testid="campaign-log">
      <div role="tablist">{all.map((t) => <button key={t.id} role="tab" type="button" aria-selected={t.id === on} data-testid={`tab-${t.id}`} onClick={() => setOn(t.id)}>{t.label}</button>)}</div>
      <div role="tabpanel">{all.find((t) => t.id === on)?.content}</div>
    </div>
  );
}

/** The "start anywhere" form from data: a checkbox, a number or a pick list per question. */
export function StartForm({ form, answers, onChange }: { form: readonly StartQuestion[]; answers: Record<string, StartAnswer | undefined>; onChange: (id: string, a: StartAnswer) => void }) {
  return (
    <form className="kit-camp-start" data-testid="start-form" onSubmit={(e) => e.preventDefault()}>
      {form.map((q) => {
        const a = answers[q.id];
        const label = q.label ?? q.id;
        if (q.options) {
          const cur = Array.isArray(a) ? a : [];
          return <fieldset key={q.id}><legend>{label}</legend>{q.options.map((o) => (
            <label key={o}><input type="checkbox" checked={cur.includes(o)} onChange={(e) => onChange(q.id, e.target.checked ? [...cur, o] : cur.filter((x) => x !== o))} />{o}</label>
          ))}</fieldset>;
        }
        if (q.min !== undefined || q.max !== undefined) return <label key={q.id}>{label}<input type="number" min={q.min} max={q.max} value={typeof a === 'number' ? a : q.min ?? 0} onChange={(e) => onChange(q.id, Number(e.target.value))} /></label>;
        return <label key={q.id}><input type="checkbox" checked={a === true} onChange={(e) => onChange(q.id, e.target.checked)} />{label}</label>;
      })}
    </form>
  );
}
