import { useRef, type CSSProperties, type InputHTMLAttributes, type ReactNode } from "react";

export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div data-part="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" data-part="segment" aria-checked={o.value === value} data-value={o.value}
          data-selected={o.value === value ? "true" : undefined} onClick={() => { onChange(o.value); }}>
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled, children, label, sub }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children?: ReactNode; label?: string; sub?: boolean;
}) {
  return (
    <button type="button" role="checkbox" data-part="toggle" aria-checked={checked} aria-label={label} disabled={disabled}
      data-checked={checked ? "true" : undefined} data-sub={sub ? "true" : undefined} onClick={() => { onChange(!checked); }}>
      <i data-part="toggle-track"><b data-part="toggle-knob" /></i>
      {children && <span data-part="toggle-text">{children}</span>}
    </button>
  );
}

export function Slider({ label, min, max, step, value, onChange, disabled, unit = "" }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; disabled?: boolean; unit?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const places = (n: number) => { const [m = "", e = "0"] = String(n).split("e"); return Math.max(0, (m.split(".")[1] ?? "").length - Number(e)); };
  const decimals = Math.min(100, Math.max(places(step), places(min)));
  const last = Math.floor((max - min) / step + 1e-9);
  const set = (v: number) => { onChange(Number((min + Math.min(last, Math.max(0, Math.round((v - min) / step))) * step).toFixed(decimals))); };
  const at = (x: number) => { const r = ref.current!.getBoundingClientRect(); set(min + ((x - r.left) / r.width) * (max - min)); };
  return (
    <div ref={ref} data-part="slider" role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      aria-valuetext={`${String(value)}${unit}`} aria-disabled={disabled} data-disabled={disabled ? "true" : undefined}
      style={{ "--fill": `${String(((value - min) / (max - min)) * 100)}%` } as CSSProperties}
      onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture?.(e.pointerId); at(e.clientX); }}
      onPointerMove={(e) => { if (!disabled && e.buttons === 1) at(e.clientX); }}
      onKeyDown={(e) => {
        if (disabled) return;
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0;
        if (d) { e.preventDefault(); set(value + d); }
        else if (e.key === "Home") set(min); else if (e.key === "End") set(max);
      }}>
      <i data-part="slider-fill" /><b data-part="slider-knob" />
    </div>
  );
}

export const TextField = (props: InputHTMLAttributes<HTMLInputElement>) => <input data-part="text-field" {...props} />;
