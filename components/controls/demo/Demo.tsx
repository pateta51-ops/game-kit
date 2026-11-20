import { useState } from "react";
import { Segmented, Slider, TextField, Toggle } from "../ui.ts";

export function Demo() {
  const [mode, setMode] = useState("easy");
  const [on, setOn] = useState(true);
  const [v, setV] = useState(0.3);
  const [t, setT] = useState("seed-42");
  return (
    <main style={{ display: "grid", gap: "1em", padding: "1em", font: "16px system-ui", maxWidth: "24em" }}>
      <Segmented label="Mode" value={mode} onChange={setMode} options={[{ value: "easy", label: "Easy" }, { value: "hard", label: "Hard" }]} />
      <Toggle checked={on} onChange={setOn}>Sound</Toggle>
      <Toggle checked={false} onChange={setOn} disabled>Disabled</Toggle>
      <Slider label="Volume" min={0} max={1} step={0.1} value={v} onChange={setV} />
      <output>Volume {v}</output>
      <TextField aria-label="Seed" value={t} onChange={(e) => { setT(e.target.value); }} />
    </main>
  );
}
