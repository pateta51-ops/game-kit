import { productsOf, toggle, type Registry } from './expansion.ts';

export interface ExpansionPickerProps {
  registry: Registry;
  base: string;
  /** The ticked products (the base is never in it). */
  ticked: readonly string[];
  onChange: (ticked: string[]) => void;
  /** Words the game owns (translation). */
  words?: { title?: string; variant?: string; empty?: string };
  className?: string;
}

/** Unstyled list of the base (always on) and the products that need it; ticking ticks what a product needs, unticking unticks what needs it. */
export function ExpansionPicker({ registry, base, ticked, onChange, words, className }: ExpansionPickerProps) {
  const list = productsOf(registry, base);
  const baseP = registry.find((p) => p.id === base);
  return (
    <fieldset className={className} data-testid="expansion-picker">
      <legend>{words?.title ?? 'Products'}</legend>
      <label data-product={base}>
        <input type="checkbox" checked disabled readOnly />
        {baseP?.name ?? base}
      </label>
      {list.length === 0 && <p data-testid="expansion-empty">{words?.empty ?? 'No expansions available.'}</p>}
      {list.map((p) => (
        <label key={p.id} data-product={p.id}>
          <input
            type="checkbox"
            checked={ticked.includes(p.id)}
            disabled={p.unavailable !== undefined}
            onChange={(e) => onChange(toggle(registry, base, ticked, p.id, e.target.checked))}
          />
          {p.name ?? p.id}
          {p.kind === 'variant' && <span data-variant-note={p.id}> {words?.variant ?? '(variant)'}</span>}
          {p.unavailable !== undefined && <span data-unavailable={p.id}> {p.unavailable}</span>}
        </label>
      ))}
    </fieldset>
  );
}
