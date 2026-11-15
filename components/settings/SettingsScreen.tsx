// The settings form drawn from the schema: one fieldset per section (named by its heading), a checkbox per toggle, a
// radio group or a drop-down per choice. Each change writes the store at once. Dev settings show only with `dev`.
import { useId } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { SettingDef, SettingsSchema } from './schema';
import type { SettingsState } from './store';
import './settings.css';

type Any = UseBoundStore<StoreApi<SettingsState<Record<string, unknown>>>>;

export interface SettingsScreenProps {
  schema: SettingsSchema;
  /** A store from createSettingsStore(schema). */
  store: object;
  dev?: boolean;
  /** `plates`: each toggle or choice option is a button (aria-pressed, class `kit-set-plate-on` when chosen), no radio or checkbox. */
  look?: 'plates';
  /** Toggle plate labels in plates mode. */
  onOff?: readonly [string, string];
  className?: string;
}

function Setting({ def, store, id, plates, onOff }: { def: SettingDef; store: Any; id: string; plates: boolean; onOff: readonly [string, string] }) {
  const value = store((s) => s.values[def.key]);
  const set = store((s) => s.set);
  const hint = def.hint === undefined ? null : <span className="kit-set-hint">{def.hint}</span>;
  const plate = (on: boolean, text: string, tid: string, go: () => void) => (
    <button type="button" key={tid} className={on ? 'kit-set-plate kit-set-plate-on' : 'kit-set-plate'} aria-pressed={on} data-testid={tid} onClick={go}>
      {text}
    </button>
  );
  if (plates && def.kind === 'toggle')
    return (
      <div className="kit-set-choice" role="group" aria-labelledby={`${id}-l`} data-testid={`setting-${def.key}`}>
        <span className="kit-set-label" id={`${id}-l`}>
          {def.label}
        </span>
        {hint}
        <div className="kit-set-plates">
          {plate(value === true, onOff[0], `setting-${def.key}-on`, () => { set(def.key, true); })}
          {plate(value !== true, onOff[1], `setting-${def.key}-off`, () => { set(def.key, false); })}
        </div>
      </div>
    );
  if (def.kind === 'toggle')
    return (
      <label className="kit-set-row">
        <input
          type="checkbox"
          checked={value === true}
          data-testid={`setting-${def.key}`}
          onChange={(e) => {
            set(def.key, e.target.checked);
          }}
        />
        <span>
          <span className="kit-set-label">{def.label}</span>
          {hint}
        </span>
      </label>
    );
  const pick = (raw: string) => {
    const o = def.options.find((x) => String(x.value) === raw);
    if (o) set(def.key, o.value);
  };
  if (plates && def.select !== true)
    return (
      <div className="kit-set-choice" role="group" aria-labelledby={`${id}-l`} data-testid={`setting-${def.key}`}>
        <span className="kit-set-label" id={`${id}-l`}>
          {def.label}
        </span>
        {hint}
        <div className="kit-set-plates">
          {def.options.map((o) => plate(value === o.value, o.label, `setting-${def.key}-${String(o.value)}`, () => { pick(String(o.value)); }))}
        </div>
      </div>
    );
  if (def.select === true)
    return (
      <label className="kit-set-row">
        <span>
          <span className="kit-set-label">{def.label}</span>
          {hint}
        </span>
        <select
          value={String(value)}
          data-testid={`setting-${def.key}`}
          onChange={(e) => {
            pick(e.target.value);
          }}
        >
          {def.options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <div className="kit-set-choice" role="radiogroup" aria-labelledby={`${id}-l`} data-testid={`setting-${def.key}`}>
      <span className="kit-set-label" id={`${id}-l`}>
        {def.label}
      </span>
      {hint}
      {def.options.map((o) => (
        <label key={String(o.value)} className="kit-set-row">
          <input
            type="radio"
            name={id}
            value={String(o.value)}
            checked={value === o.value}
            data-testid={`setting-${def.key}-${String(o.value)}`}
            onChange={() => {
              pick(String(o.value));
            }}
          />
          <span>
            <span className="kit-set-option">{o.label}</span>
            {o.line === undefined ? null : <span className="kit-set-hint">{o.line}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export function SettingsScreen({ schema, store, dev = false, look, onOff = ['On', 'Off'], className }: SettingsScreenProps) {
  const id = useId();
  return (
    <div className={className === undefined ? 'kit-set' : `kit-set ${className}`}>
      {schema.sections.map((sec) => {
        const shown = sec.settings.filter((d) => dev || d.dev !== true);
        if (shown.length === 0) return null;
        return (
          <fieldset key={sec.id} className="kit-set-section" aria-labelledby={`${id}-${sec.id}`}>
            <h2 className="kit-set-title" id={`${id}-${sec.id}`}>
              {sec.title}
            </h2>
            {shown.map((d) => (
              <Setting key={d.key} def={d} store={store as Any} id={`${id}-${d.key}`} plates={look === 'plates'} onOff={onOff} />
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}
